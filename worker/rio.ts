// Caudal estimado del Turia en Villastar: modelo GloFAS de Copernicus a través de la API de crecidas de Open-Meteo
// (https://open-meteo.com/en/docs/flood-api, CC BY 4.0). Es un modelo hidrológico diario, no una medición.
import type { DiaRio, RespuestaRio } from "../shared/tipos";

/** Celda de la rejilla de GloFAS (0,05°) que sigue el cauce del Turia junto a Villastar. */
export const CELDA_RIO = { lat: 40.275, lon: -1.175 };
const API = "https://flood-api.open-meteo.com/v1/flood";
const DESDE = "1991-01-01";
/** Días de margen alrededor de la fecha para calcular lo normal en esa época del año */
const VENTANA = 10;
const DIAS_PASADOS = 45;
const DIAS_PREVISION = 15;

type Ctx = { waitUntil(p: Promise<unknown>): void };

async function pedir(url: string, segundos: number, ctx: Ctx): Promise<any> {
  const cache = caches.default;
  const clave = new Request(url);
  const guardada = await cache.match(clave);
  if (guardada) return guardada.json();
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Open-Meteo crecidas HTTP ${r.status}`);
  const texto = await r.text();
  ctx.waitUntil(cache.put(clave, new Response(texto, { headers: { "Cache-Control": `public, max-age=${segundos}`, "Content-Type": "application/json" } })));
  return JSON.parse(texto);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Día del año (1-366) de una fecha AAAA-MM-DD. */
function diaDelAnio(fecha: string): number {
  const t = Date.parse(`${fecha}T00:00:00Z`);
  return Math.floor((t - Date.UTC(Number(fecha.slice(0, 4)), 0, 1)) / 86400_000) + 1;
}

function percentil(ordenados: number[], p: number): number {
  const i = (ordenados.length - 1) * p;
  const a = Math.floor(i);
  const b = Math.ceil(i);
  return ordenados[a] + (ordenados[b] - ordenados[a]) * (i - a);
}

/**
 * Lo normal para cada día del año: mediana y percentil 90 del caudal de todos los años del histórico
 * en una ventana de ±VENTANA días. Devuelve un índice por día del año (1-366).
 */
export function climatologia(historico: [string, number][]): Map<number, { normal: number; alto: number }> {
  const porDia = new Map<number, number[]>();
  for (const [fecha, v] of historico) {
    const d = diaDelAnio(fecha);
    for (let k = -VENTANA; k <= VENTANA; k++) {
      const dd = ((d + k - 1 + 366) % 366) + 1;
      if (!porDia.has(dd)) porDia.set(dd, []);
      porDia.get(dd)!.push(v);
    }
  }
  const res = new Map<number, { normal: number; alto: number }>();
  for (const [d, vals] of porDia) {
    vals.sort((a, b) => a - b);
    res.set(d, { normal: r2(percentil(vals, 0.5)), alto: r2(percentil(vals, 0.9)) });
  }
  return res;
}

/** Junta el histórico (para lo normal) con los últimos días y la previsión. */
export function adaptarRio(historico: any, reciente: any, hoy: string): RespuestaRio {
  const h = historico?.daily ?? {};
  const pares: [string, number][] = [];
  (h.time ?? []).forEach((f: string, i: number) => {
    const v = num(h.river_discharge?.[i]);
    if (v !== null && f < hoy) pares.push([f, v]);
  });
  const clima = climatologia(pares);
  const d = reciente?.daily ?? {};
  const dias: DiaRio[] = (d.time ?? []).map((fecha: string, i: number) => {
    const c = clima.get(diaDelAnio(fecha));
    const prevision = fecha > hoy;
    return {
      fecha,
      caudal: num(d.river_discharge?.[i]),
      minimo: prevision ? num(d.river_discharge_min?.[i]) : null,
      maximo: prevision ? num(d.river_discharge_max?.[i]) : null,
      normal: c?.normal ?? null,
      alto: c?.alto ?? null,
      prevision,
    };
  });
  const actual = dias.filter((x) => !x.prevision && x.caudal !== null).at(-1) ?? null;
  // Aviso: el escenario central de la previsión supera el umbral → probable; solo lo supera el más lluvioso → posible.
  // Umbral: lo habitualmente alto (p90) de la época, y como poco el doble de lo normal y 1 m³/s (evita avisos por décimas en épocas secas)
  let aviso: RespuestaRio["aviso"] = null;
  for (const x of dias.filter((x) => x.prevision && x.alto !== null)) {
    const umbral = Math.max(x.alto!, 2 * (x.normal ?? 0), 1);
    if (x.caudal !== null && x.caudal > umbral) {
      aviso = { nivel: "probable", fecha: x.fecha, caudal: x.caudal };
      break;
    }
    if (!aviso && x.maximo !== null && x.maximo > umbral) aviso = { nivel: "posible", fecha: x.fecha, caudal: x.maximo };
  }
  return {
    lat: CELDA_RIO.lat,
    lon: CELDA_RIO.lon,
    actual,
    dias,
    aviso,
    desde: pares[0]?.[0] ?? null,
  };
}

export async function estadoRio(ctx: Ctx): Promise<RespuestaRio> {
  const hoy = new Date().toISOString().slice(0, 10);
  // El histórico solo cambia una vez al día; la URL incluye el año para renovarlo cada enero
  const ayer = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const base = `${API}?latitude=${CELDA_RIO.lat}&longitude=${CELDA_RIO.lon}`;
  const [historico, reciente] = await Promise.all([
    pedir(`${base}&daily=river_discharge&start_date=${DESDE}&end_date=${ayer.slice(0, 4)}-01-01`, 86400, ctx),
    pedir(
      `${base}&daily=river_discharge,river_discharge_min,river_discharge_max&past_days=${DIAS_PASADOS}&forecast_days=${DIAS_PREVISION}`,
      3 * 3600,
      ctx,
    ),
  ]);
  return adaptarRio(historico, reciente, hoy);
}
