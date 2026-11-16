// Radar de precipitación de RainViewer (https://www.rainviewer.com/api.html).
// RainViewer solo publica las 2 últimas horas. Para poder mirar hasta 24 h atrás, el cron guarda cada
// 10 minutos las teselas de la zona de la red (sus condiciones piden cachear de nuestro lado).
import type { RespuestaRadar } from "../shared/tipos";
import { conCache } from "./seguimiento";

type Ctx = { waitUntil(p: Promise<unknown>): void };

const JSON_RAINVIEWER = "https://api.rainviewer.com/public/weather-maps.json";
/** Horas que se conservan */
const HORAS_ARCHIVO = 24;
/** Zoom que se guarda (el mapa del radar va de 7 a 10; por encima de 7 se amplía la tesela de 7) */
const ZOOMS = [7];
/** Como mucho tantas peticiones por ejecución (el plan gratuito permite 50) */
const PRESUPUESTO = 45;

/** Plantilla de teselas de una imagen de RainViewer: 256 px, esquema de color 2, suavizado y nieve. */
const plantilla = (host: string, ruta: string) => `${host}${ruta}/256/{z}/{x}/{y}/2/1_1.png`;

/** Zona que se archiva: un rectángulo alrededor del centro de la red. */
export function zonaRadar(env: Env): [[number, number], [number, number]] {
  const lat = Number(env.RED_LAT);
  const lon = Number(env.RED_LON);
  return [
    [lat - 2.2, lon - 6.5],
    [lat + 2.2, lon + 6.5],
  ];
}

const aX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const aY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Teselas [z, x, y] que cubren la zona en los zooms que se guardan. */
export function teselasZona(zona: [[number, number], [number, number]]): [number, number, number][] {
  const [[sur, oeste], [norte, este]] = zona;
  const lista: [number, number, number][] = [];
  for (const z of ZOOMS) {
    for (let x = aX(oeste, z); x <= aX(este, z); x++) {
      for (let y = aY(norte, z); y <= aY(sur, z); y++) lista.push([z, x, y]);
    }
  }
  return lista;
}

/** Para el cron: guarda las imágenes nuevas de la zona y borra las de más de 24 h. */
export async function archivarRadar(env: Env) {
  const r = await fetch(JSON_RAINVIEWER, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`RainViewer HTTP ${r.status}`);
  const j: any = await r.json();
  const teselas = teselasZona(zonaRadar(env));
  const ultimaGuardada = (await env.DB.prepare("SELECT max(t) AS t FROM radar_teselas").first<number>("t")) ?? 0;
  const nuevas: { time: number; path: string }[] = (j.radar?.past ?? []).filter((p: { time: number }) => p.time > ultimaGuardada);
  // Primero las más recientes, sin pasarse del presupuesto de peticiones
  const caben = Math.max(1, Math.floor((PRESUPUESTO - 1) / teselas.length));
  for (const imagen of nuevas.slice(-caben)) {
    const url = plantilla(j.host, imagen.path);
    const descargas = await Promise.all(
      teselas.map(async ([z, x, y]) => {
        const t = await fetch(url.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)), { signal: AbortSignal.timeout(15_000) });
        return t.ok ? { z, x, y, png: await t.arrayBuffer() } : null;
      }),
    );
    const filas = descargas.filter((d): d is NonNullable<typeof d> => d !== null);
    if (!filas.length) continue;
    await env.DB.batch(
      filas.map((d) => env.DB.prepare("INSERT OR IGNORE INTO radar_teselas (t, z, x, y, png) VALUES (?, ?, ?, ?, ?)").bind(imagen.time, d.z, d.x, d.y, d.png)),
    );
  }
  await env.DB.prepare("DELETE FROM radar_teselas WHERE t < ?").bind(Math.floor(Date.now() / 1000) - (HORAS_ARCHIVO + 2) * 3600).run();
}

/** Imágenes disponibles: las 2 últimas horas en directo y, antes, las archivadas. */
export async function radar(env: Env, ctx: Ctx): Promise<RespuestaRadar> {
  const j = JSON.parse(await conCache(JSON_RAINVIEWER, 120, ctx));
  const directo = new Map<number, string>((j.radar?.past ?? []).map((p: { time: number; path: string }) => [p.time, plantilla(j.host, p.path)]));
  const desde = Math.floor(Date.now() / 1000) - HORAS_ARCHIVO * 3600;
  const archivadas = (await env.DB.prepare("SELECT DISTINCT t FROM radar_teselas WHERE t >= ? ORDER BY t").bind(desde).all<{ t: number }>()).results;
  const imagenes = new Map<number, string>();
  for (const { t } of archivadas) imagenes.set(t, `/api/radar/tesela/${t}/{z}/{x}/{y}`);
  for (const [t, url] of directo) imagenes.set(t, url);
  return {
    imagenes: [...imagenes.entries()].sort((a, b) => a[0] - b[0]).map(([t, url]) => ({ t, url })),
    zona: zonaRadar(env),
  };
}

/** Una tesela archivada. */
export async function teselaRadar(env: Env, t: number, z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  const fila = await env.DB.prepare("SELECT png FROM radar_teselas WHERE t = ? AND z = ? AND x = ? AND y = ?").bind(t, z, x, y).first<{ png: ArrayBuffer }>();
  return fila?.png ?? null;
}
