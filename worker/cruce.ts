// Cruce entre Meteoclimatic y Weather Underground.
//  - Gemelas: muchos aficionados envían la misma estación a las dos redes. Se buscan parejas cercanas (< 2 km) y se
//    comparan la máxima y la mínima del día; si coinciden, es la misma estación. Sirve para enseñar un solo punto en
//    el mapa y para traer de Weather Underground el histórico de una estación de Meteoclimatic.
//  - Avisos de calidad: estaciones que dan valores imposibles o muy distintos de los de sus vecinas («puede medir mal»).
//  - Histórico: las estaciones dadas de alta con estación en Weather Underground (la suya o su gemela) traen su
//    resumen diario de años atrás, poco a poco y con las peticiones que sobran cada día.
// La comprobación se hace una vez por semana, al final del día (cuando la máxima y la mínima ya están).
import { fechaLocal } from "./fechas";
import { PROVINCIAS_GUARDADAS, catalogoGuardado, feedProvincia } from "./meteoclimatic";
import { CUPO_FICHAS, listaWU, pedirWU } from "./wunderground";

/** Hasta qué uso del cupo diario se puede traer histórico (el resto queda para las lecturas de las dadas de alta) */
const CUPO_HISTORICO = 1000;
/** Distancia máxima entre dos estaciones para pensar que pueden ser la misma */
const KM_GEMELAS = 2;
/** Diferencia máxima (°C) de la máxima y la mínima del día para considerarlas la misma estación */
const IGUALES = 0.3;
/** Diferencia con la mediana de las vecinas (°C) a partir de la que se avisa */
const DESVIO = 4;
/** Vecinas: estaciones a menos de tantos km */
const KM_VECINAS = 15;

const distancia = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180));
const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Una gemela está confirmada si ha coincidido alguna vez y más veces de las que no. */
export const SQL_GEMELA_CONFIRMADA = "iguales >= 1 AND iguales > distintos";

interface Extremos {
  tx: number | null;
  tn: number | null;
  hx: number | null;
  hn: number | null;
  presion: number | null;
}

/** Máxima, mínima, humedad y presión de hoy de todas las estaciones de una provincia de Meteoclimatic. */
async function extremosHoyMC(region: string): Promise<Map<string, Extremos>> {
  const xml = await feedProvincia(region);
  const num = (s: string | undefined) => (s === undefined || s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
  const fuera = new Map<string, Extremos>();
  for (const m of xml.matchAll(/<station>([\s\S]*?)<\/station>/g)) {
    const b = m[1];
    const id = b.match(/<id>([^<]+)<\/id>/)?.[1];
    if (!id) continue;
    const t = b.match(/<temperature>[\s\S]*?<max>([^<]*)<\/max>[\s\S]*?<min>([^<]*)<\/min>/);
    const h = b.match(/<humidity>[\s\S]*?<max>([^<]*)<\/max>[\s\S]*?<min>([^<]*)<\/min>/);
    const p = b.match(/<barometre>[\s\S]*?<now>([^<]*)<\/now>/);
    fuera.set(id, { tx: num(t?.[1]), tn: num(t?.[2]), hx: num(h?.[1]), hn: num(h?.[2]), presion: num(p?.[1]) });
  }
  return fuera;
}

/** Valores imposibles: el motivo del aviso, o null si todo es razonable. */
function imposible(e: Extremos): string | null {
  if (e.tx === null || e.tn === null) return "No da temperatura";
  if (e.tx < e.tn) return "La máxima del día es menor que la mínima";
  if ((e.hn !== null && e.hn < 3) || (e.hx !== null && e.hx > 100)) return "Humedad imposible";
  if (e.presion !== null && (e.presion < 950 || e.presion > 1060)) return "Da la presión sin corregir al nivel del mar";
  return null;
}

/**
 * Comprueba las gemelas y los avisos de calidad (una vez por semana). Devuelve un resumen de lo hecho.
 * Gasta una petición de Weather Underground por cada estación suya cercana a una de Meteoclimatic.
 */
export async function comprobarCruce(env: Env): Promise<{ parejas: number; gemelas: number; avisos: number }> {
  const db = env.DB;
  const ahora = Math.floor(Date.now() / 1000);
  const hoy = fechaLocal(ahora);
  const region = PROVINCIAS_GUARDADAS[0];
  const [mc, wu, extremosMC] = await Promise.all([catalogoGuardado(db, region), listaWU(env), extremosHoyMC(region)]);

  // Puntos con la máxima y la mínima de hoy, para comparar con las vecinas
  const puntos: { red: string; codigo: string; lat: number; lon: number; e: Extremos }[] = [];
  for (const m of mc) {
    const e = extremosMC.get(m.codigo);
    if (e) puntos.push({ red: "meteoclimatic", codigo: m.codigo, lat: m.lat, lon: m.lon, e });
  }

  // Weather Underground: solo las que tienen una de Meteoclimatic cerca (una petición cada una)
  const candidatas = wu.filter((w) => mc.some((m) => extremosMC.has(m.codigo) && distancia(m, w) < KM_GEMELAS));
  const sentencias: D1PreparedStatement[] = [];
  let gemelas = 0;
  for (const w of candidatas.slice(0, 30)) {
    let resumen: any = null;
    try {
      const r = await pedirWU(env, `https://api.weather.com/v2/pws/dailysummary/7day?stationId=${w.codigo}&format=json&units=m&numericPrecision=decimal`, CUPO_FICHAS);
      if (r.ok) resumen = ((await r.json()) as any)?.summaries?.find((s: any) => String(s.obsTimeLocal ?? "").startsWith(hoy));
    } catch (e) {
      console.error("cruce", w.codigo, e);
      break; // sin cupo o sin conexión: se deja para otra vez
    }
    if (!resumen) continue;
    const e: Extremos = {
      tx: resumen.metric?.tempHigh ?? null,
      tn: resumen.metric?.tempLow ?? null,
      hx: resumen.humidityHigh ?? null,
      hn: resumen.humidityLow ?? null,
      presion: resumen.metric?.pressureMax ?? null,
    };
    puntos.push({ red: "wunderground", codigo: w.codigo, lat: w.lat, lon: w.lon, e });
    for (const m of mc) {
      const km = distancia(m, w);
      const em = extremosMC.get(m.codigo);
      if (km >= KM_GEMELAS || !em || em.tx === null || em.tn === null || e.tx === null || e.tn === null) continue;
      const iguales = Math.abs(em.tx - e.tx) <= IGUALES && Math.abs(em.tn - e.tn) <= IGUALES;
      if (iguales) gemelas++;
      sentencias.push(
        db
          .prepare(
            `INSERT INTO gemelas (mc, wu, km, iguales, distintos, comprobado) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (mc, wu) DO UPDATE SET km = excluded.km, iguales = iguales + excluded.iguales,
               distintos = distintos + excluded.distintos, comprobado = excluded.comprobado`,
          )
          .bind(m.codigo, w.codigo, Math.round(km * 100) / 100, iguales ? 1 : 0, iguales ? 0 : 1, ahora),
      );
    }
  }

  // Avisos: valores imposibles, o máxima / mínima muy distintas de la mediana de las vecinas
  let avisos = 0;
  for (const p of puntos) {
    let aviso = imposible(p.e);
    if (!aviso && p.e.tx !== null && p.e.tn !== null) {
      const vecinas = puntos.filter((o) => o !== p && o.e.tx !== null && o.e.tn !== null && distancia(o, p) < KM_VECINAS && !imposible(o.e));
      if (vecinas.length >= 2) {
        const dx = p.e.tx - mediana(vecinas.map((o) => o.e.tx!));
        const dn = p.e.tn - mediana(vecinas.map((o) => o.e.tn!));
        if (Math.abs(dx) > DESVIO || Math.abs(dn) > DESVIO) {
          aviso = `Muy distinta de las de alrededor (hoy ${Math.abs(dx) > Math.abs(dn) ? `máxima ${dx > 0 ? "+" : ""}${dx.toFixed(1)}` : `mínima ${dn > 0 ? "+" : ""}${dn.toFixed(1)}`} °C)`;
        }
      }
    }
    if (aviso) {
      avisos++;
      sentencias.push(
        db
          .prepare("INSERT INTO avisos_estacion (red, codigo, aviso, detectado) VALUES (?, ?, ?, ?) ON CONFLICT (red, codigo) DO UPDATE SET aviso = excluded.aviso, detectado = excluded.detectado")
          .bind(p.red, p.codigo, aviso, ahora),
      );
    } else {
      sentencias.push(db.prepare("DELETE FROM avisos_estacion WHERE red = ? AND codigo = ?").bind(p.red, p.codigo));
    }
  }
  sentencias.push(db.prepare("INSERT INTO tareas (nombre, ultima) VALUES ('cruce', ?) ON CONFLICT (nombre) DO UPDATE SET ultima = excluded.ultima").bind(ahora));
  for (let i = 0; i < sentencias.length; i += 50) await db.batch(sentencias.slice(i, i + 50));

  // Estaciones de Meteoclimatic dadas de alta que ya tienen gemela confirmada: su histórico, de Weather Underground
  await db
    .prepare(
      `UPDATE estaciones SET historico_wu = (
         SELECT g.wu FROM gemelas g WHERE g.mc = upper(estaciones.meteoclimatic) AND g.iguales >= 1 AND g.iguales > g.distintos ORDER BY g.km LIMIT 1),
         historico_pendiente = ?, historico_vacios = 0
       WHERE tipo = 'externa' AND fuente = 'meteoclimatic' AND historico_wu IS NULL
         AND EXISTS (SELECT 1 FROM gemelas g WHERE g.mc = upper(estaciones.meteoclimatic) AND g.iguales >= 1 AND g.iguales > g.distintos)`,
    )
    .bind(sumarDias(hoy, -1))
    .run();
  return { parejas: candidatas.length, gemelas, avisos };
}

/** ¿Toca la comprobación? Una vez por semana, al final del día (desde las 21:00 de Madrid). */
export async function tocaCruce(env: Env, ahora: number): Promise<boolean> {
  const hora = Number(new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "numeric", hourCycle: "h23" }).format(ahora * 1000));
  if (hora < 21) return false;
  const ultima = await env.DB.prepare("SELECT ultima FROM tareas WHERE nombre = 'cruce'").first<number>("ultima");
  return !ultima || ahora - ultima > 6.5 * 86400;
}

/**
 * Trae unos cuantos días de histórico de Weather Underground (hacia atrás) de las estaciones que lo tienen pendiente.
 * Cada día es una petición; se para si el cupo del día ya va por CUPO_HISTORICO. Solo añade días que no existen.
 */
export async function avanzarHistoricoWU(env: Env, maxDias = 5): Promise<number> {
  const db = env.DB;
  const filas = (
    await db
      .prepare("SELECT id, historico_wu, historico_pendiente, historico_vacios FROM estaciones WHERE historico_wu IS NOT NULL AND historico_pendiente IS NOT NULL LIMIT 2")
      .all<{ id: number; historico_wu: string; historico_pendiente: string; historico_vacios: number }>()
  ).results;
  let hechos = 0;
  for (const f of filas) {
    let dia = f.historico_pendiente;
    let vacios = f.historico_vacios;
    while (hechos < maxDias && dia) {
      let o: any = null;
      try {
        const r = await pedirWU(env, `https://api.weather.com/v2/pws/history/daily?stationId=${f.historico_wu}&date=${dia.replaceAll("-", "")}&format=json&units=m&numericPrecision=decimal`, CUPO_HISTORICO);
        if (r.status !== 204 && !r.ok) throw new Error(`HTTP ${r.status}`);
        o = r.status === 204 ? null : ((await r.json()) as any)?.observations?.[0];
      } catch (e) {
        console.error("histórico WU", f.historico_wu, dia, e);
        return hechos; // sin cupo: se sigue en otra pasada
      }
      hechos++;
      if (o?.metric) {
        vacios = 0;
        const m = o.metric;
        const v = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
        const presion = (x: unknown) => (typeof x === "number" && x >= 950 && x <= 1060 ? x : null);
        await db
          .prepare(
            `INSERT OR IGNORE INTO resumen_diario (estacion_id, fecha, tmax, tmin, hum_max, hum_min, presion_max, presion_min, viento_max,
               racha_max, lluvia, radiacion_max, uv_max, temp_suma, temp_n, viento_suma, viento_n, lecturas, origen)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'wu')`,
          )
          .bind(
            f.id, dia, v(m.tempHigh), v(m.tempLow), v(o.humidityHigh), v(o.humidityLow), presion(m.pressureMax), presion(m.pressureMin),
            v(m.windspeedHigh), v(m.windgustHigh), v(m.precipTotal), v(o.solarRadiationHigh), v(o.uvHigh),
            v(m.tempAvg), v(m.tempAvg) === null ? 0 : 1, v(m.windspeedAvg), v(m.windspeedAvg) === null ? 0 : 1,
          )
          .run();
      } else vacios++;
      // Se termina tras dos meses seguidos sin datos (la estación aún no existía) o al llegar a 2010
      dia = vacios >= 60 || dia <= "2010-01-01" ? "" : sumarDias(dia, -1);
    }
    await db.prepare("UPDATE estaciones SET historico_pendiente = ?, historico_vacios = ? WHERE id = ?").bind(dia || null, vacios, f.id).run();
    if (hechos >= maxDias) break;
  }
  return hechos;
}
