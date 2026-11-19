// Estaciones oficiales de AEMET de la zona, para el mapa de Estaciones.
// La consulta de todas las estaciones de España a la vez pesa 3 MB: procesarla pasaría del límite de cálculo del plan
// gratuito de Cloudflare. Así que:
//  - la lista de las de la zona sale del inventario de AEMET (170 KB), una vez al mes;
//  - el último dato de cada una se pide con su consulta propia (pequeña), unas pocas en cada pasada de 10 minutos, de
//    modo que cada una se refresca más o menos cada hora (AEMET publica cada hora).
// Las que se dan de alta se leen además con su conector, como cualquier estación, y guardan su histórico.

import { localAUnix } from "./fechas";
import { guardarDias, type DiaImportado } from "./historico-dias";

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
export async function pedirAemet(env: Env, ruta: string): Promise<any> {
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
export function diaClimatologico(o: any, alt: number | null): DiaImportado {
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
    viento_max: null, // AEMET da el viento medio del día, no el máximo de los medios
    racha_max: ms(o.racha),
    racha_max_ts: horaAemet(fecha, o.horaracha),
    lluvia: numAemet(o.prec),
    radiacion_max: null,
    uv_max: null,
    temp_media: tmed,
    viento_medio: ms(o.velmedia),
  };
}

/** Estaciones a las que se completan los últimos días en cada pasada (cada una, una vez al día) */
const RECIENTES_POR_PASADA = 4;

/**
 * Una vez al día, cada estación de AEMET dada de alta: sus últimos 15 días. AEMET publica el resumen diario con unos
 * días de retraso: así se rellenan los días entre su último resumen y el alta (y los que falten). Unas pocas por
 * pasada, por turnos: vale igual con 3 estaciones que con 300.
 */
export async function completarRecientesAemet(env: Env): Promise<void> {
  if (!env.AEMET_API_KEY) return;
  const db = env.DB;
  const hoy = new Date().toISOString().slice(0, 10);
  const estaciones = (
    await db
      .prepare(
        `SELECT e.id, e.aemet, e.altitud FROM estaciones e
         LEFT JOIN tareas t ON t.nombre = 'aemet-recientes-' || e.id
         WHERE e.aemet IS NOT NULL AND e.activa = 1 AND (t.ultima IS NULL OR t.ultima < unixepoch() - 20 * 3600)
         ORDER BY t.ultima IS NOT NULL, t.ultima LIMIT ?`,
      )
      .bind(RECIENTES_POR_PASADA)
      .all<{ id: number; aemet: string; altitud: number | null }>()
  ).results;
  for (const f of estaciones) {
    try {
      const dias: any[] = await pedirAemet(
        env,
        `/valores/climatologicos/diarios/datos/fechaini/${sumarDias(hoy, -15)}T00:00:00UTC/fechafin/${hoy}T23:59:59UTC/estacion/${encodeURIComponent(f.aemet)}`,
      );
      const filas = dias.map((o) => diaClimatologico(o, f.altitud)).filter((d) => d.tmax !== null || d.lluvia !== null);
      if (filas.length) await guardarDias(db, f.id, "aemet", filas);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      if (/l.mite/i.test(msg)) return; // se reintenta en la siguiente pasada
      if (!/no hay datos/i.test(msg)) console.error("recientes AEMET", f.aemet, msg);
    }
    await db
      .prepare("INSERT INTO tareas (nombre, ultima) VALUES (?, unixepoch()) ON CONFLICT (nombre) DO UPDATE SET ultima = excluded.ultima")
      .bind(`aemet-recientes-${f.id}`)
      .run();
  }
}
