// Estaciones oficiales de AEMET de la zona, para el mapa de Estaciones.
// La consulta de todas las estaciones de España a la vez pesa 3 MB: procesarla pasaría del límite de cálculo del plan
// gratuito de Cloudflare. Así que:
//  - la lista de las de la zona sale del inventario de AEMET (170 KB), una vez al mes;
//  - el último dato de cada una se pide con su consulta propia (pequeña), unas pocas en cada pasada de 10 minutos, de
//    modo que cada una se refresca más o menos cada hora (AEMET publica cada hora).
// Las que se dan de alta se leen además con su conector, como cualquier estación, y guardan su histórico.

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
