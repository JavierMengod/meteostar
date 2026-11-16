// Radar (RainViewer) y satélite (EUMETSAT, MTG).
//
// El servidor WMS de EUMETSAT tarda 10-20 s en generar cada imagen, así que el cron descarga
// cada 10 minutos las imágenes de las últimas 24 horas y las guarda en KV; la web las sirve
// desde ahí al instante. Las de otras fechas se descargan al pedirlas (y se guardan unos días).
//
// La imagen en color (GeoColour: color real de día y luces de las ciudades de noche) se publica
// con 1-2 horas de retraso: hasta entonces EUMETSAT responde con error. El cron la reintenta.
import type { RespuestaSatelite } from "../shared/tipos";

type Ctx = { waitUntil(p: Promise<unknown>): void };

/** fetch de texto con caché del Worker durante `segundos`. */
export async function conCache(url: string, segundos: number, ctx: Ctx): Promise<string> {
  const cache = caches.default;
  const clave = new Request(url);
  const guardada = await cache.match(clave);
  if (guardada) return guardada.text();
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`);
  const texto = await r.text();
  ctx.waitUntil(cache.put(clave, new Response(texto, { headers: { "Cache-Control": `public, max-age=${segundos}` } })));
  return texto;
}

export const CAPAS_SATELITE = {
  color: "mtg_fd:rgb_geocolour",
  infrarrojo: "mtg_fd:ir105_hrfi",
} as const;
export type CapaSatelite = keyof typeof CAPAS_SATELITE;

/** Duraciones de la animación (horas) y minutos entre imágenes de cada una: como mucho 13 imágenes. */
export const PASOS: Record<number, number> = { 1: 10, 3: 20, 6: 30, 12: 60, 24: 120 };

const MINUTO = 60_000;
/** Horas que el cron mantiene descargadas */
const HORAS_GUARDADAS = 24;
/** Tiempo mínimo entre dos intentos de descargar una imagen que falló */
const REINTENTO = 30 * MINUTO;

// Recorte fijo de la península y Baleares en Web Mercator (EPSG:3857)
const BBOX = [-1500000, 4100000, 600000, 5600000];
const ANCHO = 1120;
const ALTO = 800;
const WMS = "https://view.eumetsat.int/geoserver/wms";

const mercALatLon = (x: number, y: number): [number, number] => [
  (Math.atan(Math.exp(y / 6378137)) * 2 - Math.PI / 2) * (180 / Math.PI),
  (x / 6378137) * (180 / Math.PI),
];
/** Límites del recorte en lat/lon: [[sur, oeste], [norte, este]] */
export const LIMITES: [[number, number], [number, number]] = [mercALatLon(BBOX[0], BBOX[1]), mercALatLon(BBOX[2], BBOX[3])];

const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

/** Primera y última imagen publicadas de una capa, y su intervalo. */
async function archivo(tipo: CapaSatelite, ctx: Ctx): Promise<{ primera: number; ultima: number; paso: number }> {
  const [espacio, nombre] = CAPAS_SATELITE[tipo].split(":");
  const xml = await conCache(
    `https://view.eumetsat.int/geoserver/${espacio}/${nombre}/ows?service=WMS&request=GetCapabilities&version=1.3.0`,
    240,
    ctx,
  );
  // <Dimension name="time" ...>inicio/fin/PT10M</Dimension>
  const m = xml.match(/<Dimension name="time"[^>]*>([^/<]+)\/([^/<]+)\/PT(\d+)M/);
  if (!m) throw new Error("EUMETSAT: sin dimensión temporal");
  return { primera: Date.parse(m[1]), ultima: Date.parse(m[2]), paso: Number(m[3]) * MINUTO };
}

/** Instantes de la animación: `horas` horas que terminan en `fin` (redondeado a 10 minutos). */
export function instantes(primera: number, fin: number, horas: number): { lista: number[]; paso: number } {
  const paso = (PASOS[horas] ?? 10) * MINUTO;
  fin -= fin % (10 * MINUTO);
  const lista: number[] = [];
  for (let t = fin - horas * 3600_000; t <= fin; t += paso) if (t >= primera) lista.push(t);
  return { lista, paso: paso / MINUTO };
}

// ----- Índice de imágenes guardadas en KV (así no hace falta listar KV, que tiene un cupo diario pequeño)

interface Indice {
  /** Imágenes guardadas (ISO) */
  ok: string[];
  /** Imágenes que fallaron y cuándo se intentó por última vez (ms) */
  fallos: Record<string, number>;
}

const claveKV = (tipo: CapaSatelite, t: string) => `sat:${tipo}:${t}`;
const claveIndice = (tipo: CapaSatelite) => `sat-indice:${tipo}`;

async function leerIndice(env: Env, tipo: CapaSatelite): Promise<Indice> {
  const j = await env.IMAGENES.get<Indice | string[]>(claveIndice(tipo), "json");
  if (!j) return { ok: [], fallos: {} };
  return Array.isArray(j) ? { ok: j, fallos: {} } : j;
}

export function urlWms(capa: string, t: string): string {
  const p = new URLSearchParams({
    service: "WMS",
    request: "GetMap",
    version: "1.1.1",
    layers: capa,
    styles: "",
    format: "image/jpeg",
    srs: "EPSG:3857",
    bbox: BBOX.join(","),
    width: String(ANCHO),
    height: String(ALTO),
    time: t,
  });
  return `${WMS}?${p}`;
}

/** Descarga una imagen de EUMETSAT y la guarda en KV: las recientes 26 h, las antiguas 3 días. */
async function descargar(env: Env, tipo: CapaSatelite, t: string): Promise<ArrayBuffer | null> {
  const r = await fetch(urlWms(CAPAS_SATELITE[tipo], t), { signal: AbortSignal.timeout(60_000) });
  if (!r.ok || !r.headers.get("content-type")?.startsWith("image/")) return null;
  const datos = await r.arrayBuffer();
  const reciente = Date.now() - Date.parse(t) < HORAS_GUARDADAS * 3600_000;
  await env.IMAGENES.put(claveKV(tipo, t), datos, { expirationTtl: reciente ? 26 * 3600 : 3 * 86400 });
  return datos;
}

/** Imagen de un instante: desde KV o, si aún no está, descargándola. */
export async function imagenSatelite(env: Env, tipo: CapaSatelite, t: string): Promise<ArrayBuffer | null> {
  return (await env.IMAGENES.get(claveKV(tipo, t), "arrayBuffer")) ?? descargar(env, tipo, t);
}

/**
 * Lista de imágenes para la web. Para "ahora", la animación termina en la última imagen ya
 * guardada (la de color va 1-2 h por detrás de la publicación de EUMETSAT).
 */
export async function satelite(env: Env, tipo: CapaSatelite, horas: number, hasta: number | null, ctx: Ctx): Promise<RespuestaSatelite> {
  const arch = await archivo(tipo, ctx);
  let fin = Math.min(hasta ?? arch.ultima, arch.ultima);
  if (hasta === null) {
    // «Ahora»: la última imagen ya guardada, pero nunca más de 2 h por detrás de la última publicada
    // (la de color se publica con retraso; si el cron se retrasa, no nos quedamos atascados en una hora vieja)
    const { ok } = await leerIndice(env, tipo);
    const guardada = ok.length ? Date.parse(ok[ok.length - 1]) : 0;
    const minimo = tipo === "color" ? arch.ultima - 2 * 3600_000 : arch.ultima;
    fin = Math.min(arch.ultima, Math.max(guardada, minimo));
  }
  const { lista, paso } = instantes(arch.primera, fin, horas);
  return {
    capa: tipo,
    limites: LIMITES,
    imagenes: lista.map((ms) => ({ t: iso(ms), url: `/api/satelite/imagen?capa=${tipo}&t=${encodeURIComponent(iso(ms))}` })),
    primera: iso(arch.primera),
    ultima: iso(arch.ultima),
    paso,
  };
}

/**
 * Para el cron: descarga las imágenes de las últimas 24 h que falten (las más recientes primero).
 * Como mucho `limite` descargas por ejecución (el plan gratuito permite 50 peticiones por invocación);
 * lo que falte se completa en las siguientes. Las que fallan se reintentan cada 30 minutos.
 */
export async function actualizarSatelite(env: Env, ctx: Ctx, limite = 40) {
  const ahora = Date.now();
  const pendientes: [CapaSatelite, string][] = [];
  const indices = new Map<CapaSatelite, { ok: Set<string>; fallos: Record<string, number> }>();
  for (const tipo of Object.keys(CAPAS_SATELITE) as CapaSatelite[]) {
    const arch = await archivo(tipo, ctx);
    const indice = await leerIndice(env, tipo);
    const desde = arch.ultima - HORAS_GUARDADAS * 3600_000;
    // Olvidar lo que ya ha caducado
    const ok = new Set(indice.ok.filter((t) => Date.parse(t) >= desde));
    const fallos = Object.fromEntries(Object.entries(indice.fallos).filter(([t]) => Date.parse(t) >= desde));
    indices.set(tipo, { ok, fallos });
    for (let ms = arch.ultima; ms > desde; ms -= arch.paso) {
      const t = iso(ms);
      if (ok.has(t) || ahora - (fallos[t] ?? 0) < REINTENTO) continue;
      pendientes.push([tipo, t]);
    }
  }
  // Primero las más recientes, intercalando las dos capas
  pendientes.sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));
  const lote = pendientes.slice(0, limite);
  for (let i = 0; i < lote.length; i += 5) {
    await Promise.all(
      lote.slice(i, i + 5).map(async ([tipo, t]) => {
        const indice = indices.get(tipo)!;
        try {
          if (await descargar(env, tipo, t)) {
            indice.ok.add(t);
            delete indice.fallos[t];
            return;
          }
        } catch (e) {
          console.error("satélite", tipo, t, e);
        }
        indice.fallos[t] = ahora;
      }),
    );
  }
  for (const [tipo, { ok, fallos }] of indices) {
    await env.IMAGENES.put(claveIndice(tipo), JSON.stringify({ ok: [...ok].sort(), fallos } satisfies Indice));
  }
}
