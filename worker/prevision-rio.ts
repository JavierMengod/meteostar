// Previsión del caudal de cada aforo: modelo GloFAS de Copernicus a través de la API de crecidas de Open-Meteo
// (https://open-meteo.com/en/docs/flood-api, CC BY 4.0).
// El modelo se equivoca mucho en ríos pequeños y regulados, así que, si el aforo tiene histórico (Anuario de Aforos),
// se corrige comparando sus cuantiles con los del aforo en los mismos días («quantile mapping»), por estaciones del año.
// Sin histórico, la previsión solo sirve para ver la tendencia.
import type { CorreccionModelo, DiaRio, RespuestaRio } from "../shared/tipos";
import type { FilaAforo } from "./aforos";

const API = "https://flood-api.open-meteo.com/v1/flood";
/**
 * Periodo del histórico del modelo. Open-Meteo cuenta las descargas largas como muchas peticiones, así que se usan
 * 20 años (suficientes para la corrección y para lo normal) y se guardan un mes.
 */
const HIST_DESDE = "2000-01-01";
const HIST_HASTA = "2019-12-31";
const UN_MES = 30 * 86400;
const DIAS_PASADOS = 20;
const DIAS_PREVISION = 15;

type Ctx = { waitUntil(p: Promise<unknown>): void };

async function pedir(url: string, segundos: number, ctx?: Ctx): Promise<any> {
  const clave = new Request(url);
  const guardada = await caches.default.match(clave);
  if (guardada) return guardada.json();
  const r = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`Open-Meteo crecidas HTTP ${r.status}`);
  const texto = await r.text();
  const p = caches.default.put(clave, new Response(texto, { headers: { "Cache-Control": `public, max-age=${segundos}`, "Content-Type": "application/json" } }));
  if (ctx) ctx.waitUntil(p);
  else await p;
  return JSON.parse(texto);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Estación del año de una fecha: 0 = dic-feb, 1 = mar-may, 2 = jun-ago, 3 = sep-nov. */
export const estacionDelAnio = (fecha: string) => Math.floor((Number(fecha.slice(5, 7)) % 12) / 3);

/**
 * Celda de la rejilla del modelo (0,05°) que sigue el cauce: de las 9 que rodean el aforo, la que lleva más agua.
 * Se busca una vez y se guarda.
 */
export async function celdaDelAforo(db: D1Database, a: FilaAforo): Promise<{ lat: number; lon: number }> {
  if (a.celda_lat !== null && a.celda_lon !== null) return { lat: a.celda_lat, lon: a.celda_lon };
  const centro = (v: number) => Math.floor(v / 0.05) * 0.05 + 0.025;
  const lats: string[] = [];
  const lons: string[] = [];
  for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
    lats.push((centro(a.lat) + dy * 0.05).toFixed(3));
    lons.push((centro(a.lon) + dx * 0.05).toFixed(3));
  }
  const j = await pedir(`${API}?latitude=${lats}&longitude=${lons}&daily=river_discharge&start_date=2019-01-01&end_date=2019-12-31`, UN_MES);
  let mejor = { lat: Number(lats[4]), lon: Number(lons[4]), media: -1 };
  (Array.isArray(j) ? j : [j]).forEach((c: any, i: number) => {
    const v: number[] = (c?.daily?.river_discharge ?? []).filter((x: unknown) => typeof x === "number");
    const media = v.length ? v.reduce((s, x) => s + x, 0) / v.length : -1;
    if (media > mejor.media) mejor = { lat: Number(lats[i]), lon: Number(lons[i]), media };
  });
  await db.prepare("UPDATE aforos SET celda_lat = ?, celda_lon = ? WHERE slug = ?").bind(mejor.lat, mejor.lon, a.slug).run();
  return { lat: mejor.lat, lon: mejor.lon };
}

/** Serie histórica del modelo en la celda (no cambia; se guarda un mes). */
export async function historicoModelo(celda: { lat: number; lon: number }): Promise<Map<string, number>> {
  const j = await pedir(`${API}?latitude=${celda.lat}&longitude=${celda.lon}&daily=river_discharge&start_date=${HIST_DESDE}&end_date=${HIST_HASTA}`, UN_MES);
  const m = new Map<string, number>();
  (j?.daily?.time ?? []).forEach((f: string, i: number) => {
    const v = num(j.daily.river_discharge?.[i]);
    if (v !== null) m.set(f, v);
  });
  return m;
}

/** Pasa un valor del modelo a la escala del aforo con los cuantiles de su estación del año. */
export function corregir(v: number, qm: number[], qa: number[]): number {
  if (v <= qm[0]) return qm[0] > 0 ? (qa[0] * v) / qm[0] : qa[0];
  const ultimo = qm.length - 1;
  // Por encima de lo visto: se suma lo que sobra, sin multiplicarlo (multiplicar dispararía las crecidas)
  if (v >= qm[ultimo]) return qa[ultimo] + (v - qm[ultimo]) * Math.min(1, qm[ultimo] > 0 ? qa[ultimo] / qm[ultimo] : 1);
  for (let i = 1; i <= ultimo; i++) {
    if (v <= qm[i]) {
      const f = qm[i] === qm[i - 1] ? 0 : (v - qm[i - 1]) / (qm[i] - qm[i - 1]);
      return qa[i - 1] + f * (qa[i] - qa[i - 1]);
    }
  }
  return v;
}

/** Aviso: la previsión central supera lo habitualmente alto → probable; solo 1 de cada 4 escenarios (percentil 75) → posible. */
export function avisoPrevision(dias: DiaRio[]): RespuestaRio["aviso"] {
  let aviso: RespuestaRio["aviso"] = null;
  for (const x of dias.filter((d) => d.prevision && d.alto !== null)) {
    const umbral = Math.max(x.alto!, 2 * (x.normal ?? 0), 0.5);
    if (x.caudal !== null && x.caudal > umbral) return { nivel: "probable", fecha: x.fecha, caudal: x.caudal };
    if (!aviso && x.maximo !== null && x.maximo > umbral) aviso = { nivel: "posible", fecha: x.fecha, caudal: x.maximo };
  }
  return aviso;
}

export interface EntradaPrevision {
  /** Respuesta de la API de crecidas: días pasados y previsión */
  reciente: any;
  hoy: string;
  correccion: CorreccionModelo | null;
  /** Lo normal del aforo para una fecha (p50 y p90), si hay histórico */
  normalAforo: ((fecha: string) => { normal: number; alto: number } | null) | null;
  /** Lo normal del modelo, si no hay histórico */
  normalModelo: ((fecha: string) => { normal: number; alto: number } | null) | null;
  /** Caudal medio de los días pasados medido en el aforo */
  medidos: Map<string, number>;
  /** Último caudal medido (para enlazar la previsión con la realidad) */
  ultimoMedido: number | null;
}

/** Junta los días medidos con la previsión (corregida si se puede). */
export function componerPrevision(e: EntradaPrevision): RespuestaRio {
  const d = e.reciente?.daily ?? {};
  const corregida = !!e.correccion && !!e.normalAforo;
  const aEscala = (v: number | null, fecha: string) => {
    if (v === null || !e.correccion) return v;
    const s = estacionDelAnio(fecha);
    return corregir(v, e.correccion.modelo[s], e.correccion.aforo[s]);
  };
  const fechas: string[] = d.time ?? [];
  // Factor para que la previsión arranque en el último caudal medido; se va diluyendo en 7 días
  const indiceHoy = fechas.indexOf(e.hoy);
  const modeloHoy = indiceHoy >= 0 ? aEscala(num(d.river_discharge?.[indiceHoy]), e.hoy) : null;
  const factor = corregida && e.ultimoMedido !== null && modeloHoy ? Math.min(5, Math.max(0.2, e.ultimoMedido / modeloHoy)) : 1;
  const dias: DiaRio[] = fechas.map((fecha, i) => {
    const prevision = fecha > e.hoy;
    const n = e.normalAforo?.(fecha) ?? e.normalModelo?.(fecha) ?? null;
    const k = prevision ? i - indiceHoy : 0;
    const ajuste = prevision && indiceHoy >= 0 ? 1 + (factor - 1) * Math.max(0, 1 - k / 7) : factor;
    const medido = e.medidos.get(fecha);
    const caudal = !prevision && corregida && medido !== undefined ? medido : aEscala(num(d.river_discharge?.[i]), fecha);
    const escala = (v: number | null) => (v === null ? null : r2(v * (corregida ? ajuste : 1)));
    return {
      fecha,
      caudal: !prevision && corregida && medido !== undefined ? r2(medido) : escala(caudal),
      minimo: prevision ? escala(aEscala(num(d.river_discharge_p25?.[i]), fecha)) : null,
      maximo: prevision ? escala(aEscala(num(d.river_discharge_p75?.[i]), fecha)) : null,
      normal: n?.normal ?? null,
      alto: n?.alto ?? null,
      prevision,
    };
  });
  return { corregida, dias, aviso: avisoPrevision(dias) };
}

export const URL_RECIENTE = (celda: { lat: number; lon: number }) =>
  `${API}?latitude=${celda.lat}&longitude=${celda.lon}&daily=river_discharge,river_discharge_p25,river_discharge_p75&past_days=${DIAS_PASADOS}&forecast_days=${DIAS_PREVISION}`;

export async function pedirReciente(celda: { lat: number; lon: number }, ctx: Ctx) {
  return pedir(URL_RECIENTE(celda), 3 * 3600, ctx);
}
