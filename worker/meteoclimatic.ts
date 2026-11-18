// Meteoclimatic por provincias: el feed de una provincia (https://www.meteoclimatic.net/feed/xml/ESARA44) trae todas
// sus estaciones con los datos actuales en una sola petición. Se guarda unos minutos en la caché del Worker y cada
// estación de la red toma de ahí la suya: da igual seguir 3 estaciones o 30, es una petición por provincia.
// El RSS de la provincia trae además las coordenadas (para el mapa de Administración).
// Licencia de los datos: Creative Commons BY-NC-ND 3.0 (uso no comercial, citando a Meteoclimatic).

const AGENTE = "Meteostar/1.0 (web meteorologica sin animo de lucro)";

/** Provincias que se pueden explorar en Administración (código de Meteoclimatic → nombre). */
export const PROVINCIAS_MC: Record<string, string> = {
  ESARA44: "Teruel",
  ESARA50: "Zaragoza",
  ESCLM16: "Cuenca",
  ESCLM19: "Guadalajara",
  ESPVA12: "Castellón",
  ESPVA46: "Valencia",
  ESCAT43: "Tarragona",
};

/** Provincia (región de Meteoclimatic) de una estación: las 7 primeras letras de su código. */
export const regionDe = (codigo: string) => codigo.slice(0, 7);

/** Texto en ISO-8859-15 a cadena. */
async function textoLatin(r: Response): Promise<string> {
  const bytes = new Uint8Array(await r.arrayBuffer());
  return new TextDecoder("iso-8859-15").decode(bytes);
}

/** Pide un feed de Meteoclimatic, guardado «segundos» en la caché del Worker. */
async function pedirFeed(tipo: "xml" | "rss", region: string, segundos: number): Promise<string> {
  if (!/^[A-Z]{5}\d{2}$/.test(region)) throw new Error("Provincia de Meteoclimatic no válida");
  const url = `https://www.meteoclimatic.net/feed/${tipo}/${region}`;
  const cache = caches.default;
  const clave = new Request(url);
  const guardada = await cache.match(clave);
  if (guardada) return guardada.text();
  const r = await fetch(url, { headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Meteoclimatic HTTP ${r.status}`);
  const texto = await textoLatin(r);
  await cache.put(clave, new Response(texto, { headers: { "Cache-Control": `public, max-age=${segundos}`, "Content-Type": "text/xml; charset=utf-8" } }));
  return texto;
}

/** XML con los datos actuales de todas las estaciones de una provincia (9 minutos en caché). */
export const feedProvincia = (region: string) => pedirFeed("xml", region, 540);

/** El bloque <station> de una estación dentro del feed de su provincia. */
export function bloqueEstacion(xml: string, codigo: string): string | null {
  for (const m of xml.matchAll(/<station>([\s\S]*?)<\/station>/g)) if (m[1].includes(`<id>${codigo}</id>`)) return `<station>${m[1]}</station>`;
  return null;
}

const desHtml = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();

export interface EstacionMC {
  codigo: string;
  nombre: string;
  lat: number;
  lon: number;
  /** Última actualización (segundos Unix) */
  t: number | null;
  temp: number | null;
  /** Calidad de la estación según Meteoclimatic (0 = buena) */
  qos: number | null;
}

/** Estaciones de una provincia con coordenadas y su último dato (el RSS, una hora en caché). */
export async function catalogoProvincia(region: string): Promise<EstacionMC[]> {
  const [rss, xml] = await Promise.all([pedirFeed("rss", region, 3600), feedProvincia(region)]);
  const datos = new Map<string, { t: number | null; temp: number | null; qos: number | null }>();
  for (const m of xml.matchAll(/<station>([\s\S]*?)<\/station>/g)) {
    const b = m[1];
    const codigo = b.match(/<id>([^<]+)<\/id>/)?.[1];
    if (!codigo) continue;
    const fecha = Date.parse(b.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] ?? "");
    const temp = Number(b.match(/<temperature>[\s\S]*?<now>([^<]*)<\/now>/)?.[1]);
    const qos = Number(b.match(/<QOS>([^<]*)<\/QOS>/)?.[1]);
    datos.set(codigo, { t: Number.isNaN(fecha) ? null : fecha / 1000, temp: Number.isFinite(temp) ? temp : null, qos: Number.isFinite(qos) ? qos : null });
  }
  const lista: EstacionMC[] = [];
  for (const m of rss.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const codigo = b.match(/perfil\/([A-Z0-9]+)/)?.[1];
    const punto = b.match(/<georss:point>\s*(-?[\d.]+)\s+(-?[\d.]+)\s*<\/georss:point>/);
    if (!codigo || !punto) continue;
    const nombre = desHtml((b.match(/<title>([^<]+)<\/title>/)?.[1] ?? codigo).replace(/\s*\([^)]*\)\s*$/, ""));
    lista.push({ codigo, nombre, lat: Number(punto[1]), lon: Number(punto[2]), ...(datos.get(codigo) ?? { t: null, temp: null, qos: null }) });
  }
  return lista;
}
