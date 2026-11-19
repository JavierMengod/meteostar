// Estaciones oficiales de AEMET de la zona, para el mapa de Estaciones.
// La consulta de todas las estaciones de España a la vez pesa 3 MB: procesarla pasaría del límite de cálculo del plan
// gratuito de Cloudflare. Así que:
//  - la lista de las de la zona sale del inventario de AEMET (170 KB), una vez al mes;
//  - el último dato de cada una se pide con su consulta propia (pequeña), unas pocas en cada pasada de 10 minutos, de
//    modo que cada una se refresca más o menos cada hora (AEMET publica cada hora).
// Las que se dan de alta se leen además con su conector, como cualquier estación, y guardan su histórico.

import { localAUnix } from "./fechas";

const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Zona del mapa (la misma que la de Weather Underground) */
const ZONA = { latMin: 39.85, latMax: 41.35, lonMin: -1.85, lonMax: 0.35 };
/** Estaciones que se refrescan en cada pasada (2 peticiones cada una) */
const POR_PASADA = 6;

const API = "https://opendata.aemet.es/opendata/api";

/** «402103N» → 40.3508; «010727W» → −1.1242 */
export function gradosDMS(s: string): number | null {
  const m = String(s ?? "").match(/^(\d{2,3})(\d{2})(\d{2})([NSEW])$/);
  if (!m) return null;
  const v = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  return Math.round((m[4] === "S" || m[4] === "W" ? -v : v) * 10000) / 10000;
}

/** Dos pasos de AEMET OpenData: la API da la dirección de los datos, que se descargan aparte (en ISO-8859-15). */
async function pedirAemet(env: Env, ruta: string): Promise<any> {
  if (!env.AEMET_API_KEY) throw new Error("Falta la clave de AEMET OpenData");
  const r1 = await fetch(`${API}${ruta}`, { headers: { api_key: env.AEMET_API_KEY }, signal: AbortSignal.timeout(15_000) });
  const p = (await r1.json()) as any;
  if (p?.estado !== 200 || !p.datos) throw new Error(`AEMET: ${p?.descripcion ?? `HTTP ${r1.status}`}`);
  const r2 = await fetch(p.datos, { signal: AbortSignal.timeout(20_000) });
  if (!r2.ok) throw new Error(`AEMET HTTP ${r2.status}`);
  return JSON.parse(new TextDecoder("iso-8859-15").decode(await r2.arrayBuffer()));
}

const capital = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(/-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

/** Renueva la lista de estaciones de la zona (si hace más de 30 días). */
export async function inventarioAemet(env: Env): Promise<void> {
  const ultima = await env.DB.prepare("SELECT max(visto) AS v FROM aemet").first<number>("v");
  if (ultima && Date.now() / 1000 - ultima < 30 * 86400) return;
  const lista: any[] = await pedirAemet(env, "/valores/climatologicos/inventarioestaciones/todasestaciones");
  const ahora = Math.floor(Date.now() / 1000);
  const sql = env.DB.prepare(
    `INSERT INTO aemet (idema, nombre, provincia, lat, lon, alt, visto) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (idema) DO UPDATE SET nombre = excluded.nombre, provincia = excluded.provincia, lat = excluded.lat,
       lon = excluded.lon, alt = excluded.alt, visto = excluded.visto`,
  );
  const filas = [];
  for (const e of lista) {
    const lat = gradosDMS(e.latitud);
    const lon = gradosDMS(e.longitud);
    if (lat === null || lon === null || lat < ZONA.latMin || lat > ZONA.latMax || lon < ZONA.lonMin || lon > ZONA.lonMax) continue;
    filas.push(sql.bind(String(e.indicativo), capital(String(e.nombre)), e.provincia ? capital(String(e.provincia)) : null, lat, lon, Number(e.altitud) || null, ahora));
  }
  if (filas.length) await env.DB.batch(filas);
}

/** Pide el último dato de unas cuantas estaciones (las que lo tienen más viejo). */
export async function refrescarAemet(env: Env): Promise<number> {
  if (!env.AEMET_API_KEY) return 0;
  await inventarioAemet(env);
  const filas = (
    await env.DB.prepare(
      `SELECT idema FROM aemet WHERE visto > unixepoch() - 60 * 86400 AND (actualizado IS NULL OR actualizado < unixepoch() - 3000)
       ORDER BY actualizado IS NOT NULL, actualizado LIMIT ?`,
    )
      .bind(POR_PASADA)
      .all<{ idema: string }>()
  ).results;
  let hechas = 0;
  for (const f of filas) {
    let ultima: any = null;
    try {
      const obs: any[] = await pedirAemet(env, `/observacion/convencional/datos/estacion/${encodeURIComponent(f.idema)}`);
      ultima = obs.filter((o) => typeof o.ta === "number").sort((a, b) => (a.fint < b.fint ? 1 : -1))[0] ?? null;
    } catch (e) {
      // AEMET pide una pausa (límite por minuto): se para aquí y estas se reintentan en la siguiente pasada
      if (/l.mite/i.test(String(e instanceof Error ? e.message : e))) break;
      // Estación sin datos recientes: se marca para no insistir en esta hora
      console.error("aemet", f.idema, e);
    }
    // Sin dato nuevo se conserva el anterior (solo se apunta que se ha intentado)
    if (ultima) {
      await env.DB.prepare("UPDATE aemet SET t = ?, temp = ?, hum = ?, actualizado = unixepoch() WHERE idema = ?")
        .bind(Math.floor(Date.parse(ultima.fint) / 1000), ultima.ta, typeof ultima.hr === "number" ? ultima.hr : null, f.idema)
        .run();
    } else {
      await env.DB.prepare("UPDATE aemet SET actualizado = unixepoch() WHERE idema = ?").bind(f.idema).run();
    }
    hechas++;
  }
  return hechas;
}

// ----- Histórico diario de las estaciones de AEMET dadas de alta -----

/** Presión de la estación → reducida al nivel del mar (fórmula barométrica, con la temperatura del aire). */
export function presionMar(p: number | null, alt: number | null, t: number | null): number | null {
  if (p === null || alt === null || !Number.isFinite(p) || p < 500) return null;
  const tt = t ?? 15;
  const v = p * Math.pow(1 - (0.0065 * alt) / (tt + 0.0065 * alt + 273.15), -5.257);
  return Math.round(v * 10) / 10;
}

/** «12,3» → 12.3; «Ip» (precipitación inapreciable) → 0; lo demás (vacío, «Acum», «Varias») → null */
const numAemet = (s: unknown): number | null => {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = String(s ?? "").trim();
  if (t === "Ip") return 0;
  const v = Number(t.replace(",", "."));
  return t && Number.isFinite(v) ? v : null;
};

/** Hora «HH:MM» de un día (hora oficial española) → segundos Unix; «Varias» → null */
const horaAemet = (fecha: string, h: unknown): number | null => {
  const m = String(h ?? "").match(/^(\d{2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23) return null;
  return localAUnix(`${fecha} ${m[1]}:${m[2]}:00`);
};

/** Un día de los valores climatológicos de AEMET → fila del resumen diario. */
export function diaClimatologico(o: any, alt: number | null) {
  const fecha = String(o.fecha);
  const ms = (v: unknown) => (numAemet(v) === null ? null : Math.round(numAemet(v)! * 3.6 * 10) / 10); // m/s → km/h
  const tmed = numAemet(o.tmed);
  return {
    fecha,
    tmax: numAemet(o.tmax),
    tmax_ts: horaAemet(fecha, o.horatmax),
    tmin: numAemet(o.tmin),
    tmin_ts: horaAemet(fecha, o.horatmin),
    hum_max: numAemet(o.hrMax),
    hum_min: numAemet(o.hrMin),
    presion_max: presionMar(numAemet(o.presMax), alt, tmed),
    presion_min: presionMar(numAemet(o.presMin), alt, tmed),
    racha_max: ms(o.racha),
    racha_max_ts: horaAemet(fecha, o.horaracha),
    lluvia: numAemet(o.prec),
    temp_media: tmed,
    viento_medio: ms(o.velmedia),
  };
}

/** Días que se piden de una vez (AEMET admite como mucho 6 meses por consulta) */
const DIAS_POR_TRAMO = 180;

/**
 * Trae el histórico diario de las estaciones de AEMET dadas de alta, hacia atrás, un tramo de 6 meses por pasada.
 * Termina tras un año seguido sin datos (la estación aún no existía). Los días que ya tienen lecturas de la propia
 * estación (las horarias de cada día desde el alta) no se tocan.
 */
export async function avanzarHistoricoAemet(env: Env, soloId?: number): Promise<number> {
  if (!env.AEMET_API_KEY) return 0;
  const db = env.DB;
  const f = await db
    .prepare(
      `SELECT id, aemet, altitud, historico_pendiente, historico_vacios FROM estaciones
       WHERE aemet IS NOT NULL AND historico_wu IS NULL AND historico_pendiente IS NOT NULL ${soloId ? "AND id = ?" : ""} LIMIT 1`,
    )
    .bind(...(soloId ? [soloId] : []))
    .first<{ id: number; aemet: string; altitud: number | null; historico_pendiente: string; historico_vacios: number }>();
  if (!f) return 0;
  const fin = f.historico_pendiente;
  const ini = sumarDias(fin, -(DIAS_POR_TRAMO - 1));
  let dias: any[] = [];
  try {
    dias = await pedirAemet(
      env,
      `/valores/climatologicos/diarios/datos/fechaini/${ini}T00:00:00UTC/fechafin/${fin}T23:59:59UTC/estacion/${encodeURIComponent(f.aemet)}`,
    );
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    // Pausa pedida por AEMET o fallo de red: se reintenta en la siguiente pasada
    if (!/no hay datos/i.test(msg)) {
      console.error("histórico AEMET", f.aemet, ini, msg);
      return 0;
    }
  }
  const filas = (Array.isArray(dias) ? dias : []).map((o) => diaClimatologico(o, f.altitud)).filter((d) => d.tmax !== null || d.lluvia !== null);
  if (filas.length) await guardarDiasAemet(db, f.id, filas);
  const vacios = filas.length ? 0 : f.historico_vacios + 1;
  const siguiente = vacios >= 2 || ini <= "1920-01-01" ? null : sumarDias(ini, -1);
  await db.prepare("UPDATE estaciones SET historico_pendiente = ?, historico_vacios = ? WHERE id = ?").bind(siguiente, vacios, f.id).run();
  return filas.length;
}

/** Guarda días del histórico de AEMET; solo pisa los que tienen pocas lecturas propias (menos de 20 en el día). */
async function guardarDiasAemet(db: D1Database, id: number, filas: ReturnType<typeof diaClimatologico>[]) {
  const sql = db.prepare(
    `INSERT INTO resumen_diario (estacion_id, fecha, tmax, tmax_ts, tmin, tmin_ts, hum_max, hum_min, presion_max, presion_min,
       racha_max, racha_max_ts, lluvia, temp_suma, temp_n, viento_suma, viento_n, lecturas, origen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'aemet')
     ON CONFLICT (estacion_id, fecha) DO UPDATE SET tmax = excluded.tmax, tmax_ts = excluded.tmax_ts, tmin = excluded.tmin,
       tmin_ts = excluded.tmin_ts, hum_max = excluded.hum_max, hum_min = excluded.hum_min, presion_max = excluded.presion_max,
       presion_min = excluded.presion_min, racha_max = excluded.racha_max, racha_max_ts = excluded.racha_max_ts,
       lluvia = excluded.lluvia, temp_suma = excluded.temp_suma, temp_n = excluded.temp_n, viento_suma = excluded.viento_suma,
       viento_n = excluded.viento_n, origen = 'aemet'
     WHERE resumen_diario.lecturas < 20`,
  );
  const lote = filas.map((d) =>
    sql.bind(
      id, d.fecha, d.tmax, d.tmax_ts, d.tmin, d.tmin_ts, d.hum_max, d.hum_min, d.presion_max, d.presion_min,
      d.racha_max, d.racha_max_ts, d.lluvia, d.temp_media, d.temp_media === null ? 0 : 1, d.viento_medio, d.viento_medio === null ? 0 : 1,
    ),
  );
  for (let i = 0; i < lote.length; i += 50) await db.batch(lote.slice(i, i + 50));
}

/**
 * Una vez al día: los últimos 15 días de cada estación de AEMET dada de alta. AEMET publica el resumen diario con
 * unos días de retraso: así se rellenan los días entre su último resumen y el alta (y los que falten).
 */
export async function completarRecientesAemet(env: Env): Promise<void> {
  if (!env.AEMET_API_KEY) return;
  const db = env.DB;
  const hoy = new Date().toISOString().slice(0, 10);
  const hecha = await db.prepare("SELECT ultima FROM tareas WHERE nombre = 'aemet-recientes'").first<number>("ultima");
  if (hecha && Date.now() / 1000 - hecha < 20 * 3600) return;
  const estaciones = (await db.prepare("SELECT id, aemet, altitud FROM estaciones WHERE aemet IS NOT NULL AND activa = 1 LIMIT 5").all<{ id: number; aemet: string; altitud: number | null }>()).results;
  for (const f of estaciones) {
    try {
      const dias: any[] = await pedirAemet(
        env,
        `/valores/climatologicos/diarios/datos/fechaini/${sumarDias(hoy, -15)}T00:00:00UTC/fechafin/${hoy}T23:59:59UTC/estacion/${encodeURIComponent(f.aemet)}`,
      );
      const filas = dias.map((o) => diaClimatologico(o, f.altitud)).filter((d) => d.tmax !== null || d.lluvia !== null);
      if (filas.length) await guardarDiasAemet(db, f.id, filas);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      if (/l.mite/i.test(msg)) return; // se reintenta en la siguiente pasada
      if (!/no hay datos/i.test(msg)) console.error("recientes AEMET", f.aemet, msg);
    }
  }
  await db.prepare("INSERT INTO tareas (nombre, ultima) VALUES ('aemet-recientes', unixepoch()) ON CONFLICT (nombre) DO UPDATE SET ultima = excluded.ultima").run();
}
