// Weather Underground: estaciones personales de la zona. A diferencia de Meteoclimatic, cada estación es una petición,
// y la clave tiene un límite diario. Por eso:
//  - la lista de estaciones (nombre y posición) se pide una vez al día, con unas pocas búsquedas por puntos;
//  - el dato actual de una estación sin dar de alta solo se pide al pulsarla (10 minutos en caché);
//  - las dadas de alta se leen cada 10 minutos;
//  - todo pasa por un contador diario que corta antes del límite, para que la clave no se bloquee.
/** Peticiones al día que nos permitimos (el límite habitual de estas claves es del orden de 1.500). */
export const CUPO_DIARIO = 1200;
/** Las fichas del mapa (estaciones sin dar de alta) solo hasta aquí: el resto queda para las dadas de alta. */
export const CUPO_FICHAS = 900;
/** Como mucho tantas estaciones de Weather Underground dadas de alta (144 lecturas al día cada una). */
export const MAX_DADAS_DE_ALTA = 8;

/** Puntos desde los que se buscan las estaciones cercanas (cubren la provincia de Teruel). */
const PUNTOS: [number, number][] = [
  [40.25, -0.75], [40.34, -1.11], [40.41, -1.44], [40.92, -1.3], [41.05, -0.13], [40.83, -0.8],
  [40.87, 0.15], [40.53, -0.4], [40.14, -0.82], [40.37, -0.71], [40.81, -0.86], [40.98, -0.45],
];
/** Rectángulo de la zona (lo que caiga fuera se descarta) */
const ZONA = { latMin: 39.85, latMax: 41.35, lonMin: -1.85, lonMax: 0.35 };

const fechaHoy = () => new Date().toISOString().slice(0, 10);

/** Apunta «n» peticiones en el cupo de hoy. Devuelve false (y no apunta nada) si se pasaría del límite. */
export async function gastarCupo(db: D1Database, n = 1, limite = CUPO_DIARIO): Promise<boolean> {
  const fila = await db
    .prepare(
      `INSERT INTO cupo (fecha, servicio, n) VALUES (?, 'wunderground', ?)
       ON CONFLICT (fecha, servicio) DO UPDATE SET n = n + excluded.n WHERE n + excluded.n <= ?
       RETURNING n`,
    )
    .bind(fechaHoy(), n, limite)
    .first<{ n: number }>();
  return fila !== null;
}

async function pedir(env: Env, url: string, limite = CUPO_DIARIO): Promise<Response> {
  if (!env.WU_API_KEY) throw new Error("Falta la clave de Weather Underground");
  if (!(await gastarCupo(env.DB, 1, limite))) throw new Error("Cupo diario de Weather Underground agotado");
  return fetch(`${url}&apiKey=${encodeURIComponent(env.WU_API_KEY)}`, { signal: AbortSignal.timeout(15_000) });
}

export interface EstacionWU {
  codigo: string;
  nombre: string;
  lat: number;
  lon: number;
}

/** Estaciones de la zona: la lista guardada, renovada una vez al día. */
export async function listaWU(env: Env): Promise<EstacionWU[]> {
  const ultima = await env.DB.prepare("SELECT max(visto) AS visto FROM wunderground").first<number>("visto");
  if (env.WU_API_KEY && (!ultima || Date.now() / 1000 - ultima > 86400)) {
    try {
      const todas = new Map<string, EstacionWU>();
      for (const [lat, lon] of PUNTOS) {
        const r = await pedir(env, `https://api.weather.com/v3/location/near?geocode=${lat},${lon}&product=pws&format=json`);
        if (!r.ok) continue;
        const l = ((await r.json()) as any)?.location ?? {};
        (l.stationId ?? []).forEach((id: string, i: number) => {
          const e = { codigo: id, nombre: String(l.stationName?.[i] ?? id), lat: Number(l.latitude?.[i]), lon: Number(l.longitude?.[i]) };
          if (e.lat > ZONA.latMin && e.lat < ZONA.latMax && e.lon > ZONA.lonMin && e.lon < ZONA.lonMax) todas.set(id, e);
        });
      }
      const ahora = Math.floor(Date.now() / 1000);
      const sql = env.DB.prepare(
        "INSERT INTO wunderground (codigo, nombre, lat, lon, visto) VALUES (?, ?, ?, ?, ?) ON CONFLICT (codigo) DO UPDATE SET nombre = excluded.nombre, lat = excluded.lat, lon = excluded.lon, visto = excluded.visto",
      );
      if (todas.size) await env.DB.batch([...todas.values()].map((e) => sql.bind(e.codigo, e.nombre, e.lat, e.lon, ahora)));
    } catch (e) {
      console.error("lista Weather Underground", e);
    }
  }
  // Las que llevan más de un mes sin salir en las búsquedas ya no se enseñan
  return (
    await env.DB.prepare("SELECT codigo, nombre, lat, lon FROM wunderground WHERE visto > unixepoch() - 30 * 86400 ORDER BY nombre").all<EstacionWU>()
  ).results;
}

/**
 * Observación actual de una estación (10 minutos en caché; solo gasta cupo si no está en caché).
 * «limite»: las fichas del mapa usan CUPO_FICHAS, para no quitarles peticiones a las estaciones dadas de alta.
 */
export async function observacionWU(env: Env, codigo: string, limite = CUPO_DIARIO): Promise<any | null> {
  if (!/^[A-Z0-9]{4,20}$/.test(codigo)) throw new Error("Código no válido");
  const clave = new Request(`https://api.weather.com/v2/pws/observations/current?stationId=${codigo}`);
  const cache = caches.default;
  const guardada = await cache.match(clave);
  if (guardada) return guardada.json();
  const r = await pedir(env, `https://api.weather.com/v2/pws/observations/current?stationId=${codigo}&format=json&units=m&numericPrecision=decimal`, limite);
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`Weather Underground HTTP ${r.status}`);
  const texto = await r.text();
  await cache.put(clave, new Response(texto, { headers: { "Cache-Control": "public, max-age=600", "Content-Type": "application/json" } }));
  return JSON.parse(texto);
}

/** Dato breve para la ficha del mapa. */
export function resumenObservacion(j: any): { t: number | null; temp: number | null; hum: number | null; qc: number | null } {
  const o = j?.observations?.[0];
  if (!o) return { t: null, temp: null, hum: null, qc: null };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { t: num(o.epoch), temp: num(o.metric?.temp), hum: num(o.humidity), qc: num(o.qcStatus) };
}

