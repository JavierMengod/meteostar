// Cálculos pesados del histórico de los aforos, por trozos.
// En el plan gratuito de Cloudflare cada ejecución del Worker solo puede usar 10 ms de CPU. Lo pesado no cambia
// (lo normal de 1991-2020 y lo del modelo de previsión), así que se calcula una sola vez, un trozo pequeño en cada
// pasada de la tarea de los aforos, y se guarda en aforo_normal y aforo_modelo. Las sumas y medias (años, meses,
// récords) las hace la base de datos al montar el resumen (historico-aforos.ts).
import { MESES_HIDROLOGICOS, diaHidrologico } from "../shared/hidrologia";
import type { FilaAforo } from "./aforos";
import { NORMAL_DESDE, NORMAL_HASTA, calcularResumen } from "./historico-aforos";
import { celdaDelAforo, historicoModelo } from "./prevision-rio";

/** Bits de calculos_hechos: 0-11 lo normal por mes, 12-15 la corrección por estación del año, 16-27 lo normal del modelo por mes */
export const BIT_NORMAL = 0;
export const BIT_CORRECCION = 12;
export const BIT_CLIMA = 16;
/** Trozos que necesita cada aforo: con histórico, lo normal y la corrección; sin histórico, lo normal del modelo */
export const NECESARIOS_ANUARIO = 0xffff;
export const NECESARIOS_SIN_ANUARIO = 0xfff << BIT_CLIMA;
/** Días de margen a cada lado para suavizar lo normal de cada día */
const VENTANA = 7;
/** Cuantiles de la corrección (0 %, 5 %… 100 %) */
const CUANTILES = Array.from({ length: 21 }, (_, i) => i / 20);
/** Años en que se compara el modelo con el aforo (los del histórico del modelo que se descarga) */
const CORRECCION_DESDE = "2000-01-01";
const CORRECCION_HASTA = "2019-12-31";

export function percentil(ordenados: ArrayLike<number>, p: number): number {
  if (!ordenados.length) return NaN;
  const i = (ordenados.length - 1) * p;
  const a = Math.floor(i);
  const b = Math.ceil(i);
  return ordenados[a] + (ordenados[b] - ordenados[a]) * (i - a);
}
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Primer y último día (del año hidrológico, 0-365) de un mes hidrológico (0 = octubre). */
export function diasDelMes(m: number): [number, number] {
  const ini = MESES_HIDROLOGICOS[m][0];
  const fin = m < 11 ? MESES_HIDROLOGICOS[m + 1][0] - 1 : 365;
  return [ini, fin];
}

/** Meses del calendario (1-12) que hacen falta para un mes hidrológico con su margen: el anterior, el propio y el siguiente. */
export function mesesConMargen(m: number): number[] {
  const real = ((m + 9) % 12) + 1; // 0 → octubre (10)
  return [((real + 10) % 12) + 1, real, (real % 12) + 1];
}

/**
 * Percentiles de cada día de un tramo del año, con una ventana de ±VENTANA días.
 * valores: pares [día del año hidrológico, caudal]. Devuelve [día, p10, p25, p50, p75, p90][].
 */
export function percentilesDias(valores: [number, number][], ini: number, fin: number, ps: number[]): [number, ...number[]][] {
  const porDia: number[][] = Array.from({ length: 366 }, () => []);
  for (const [d, v] of valores) porDia[d].push(v);
  const out: [number, ...number[]][] = [];
  for (let d = ini; d <= fin; d++) {
    let n = 0;
    for (let k = -VENTANA; k <= VENTANA; k++) n += porDia[(d + k + 366) % 366].length;
    if (!n) continue;
    const v = new Float64Array(n);
    let i = 0;
    for (let k = -VENTANA; k <= VENTANA; k++) for (const x of porDia[(d + k + 366) % 366]) v[i++] = x;
    v.sort();
    out.push([d, ...ps.map((p) => r3(percentil(v, p)))]);
  }
  return out;
}

/** Cuantiles del modelo y del aforo para una estación del año (al menos 270 días comunes, unos 3 años). */
export function cuantilesCorreccion(aforo: { fecha: string; caudal: number }[], modelo: Map<string, number>): { modelo: number[]; aforo: number[] } | null {
  const m: number[] = [];
  const a: number[] = [];
  for (const f of aforo) {
    const v = modelo.get(f.fecha);
    if (v === undefined) continue;
    m.push(v);
    a.push(f.caudal);
  }
  if (m.length < 270) return null;
  m.sort((x, y) => x - y);
  a.sort((x, y) => x - y);
  return { modelo: CUANTILES.map((p) => r3(percentil(m, p))), aforo: CUANTILES.map((p) => r3(percentil(a, p))) };
}

/** Meses (1-12) de cada estación del año: 0 dic-feb, 1 mar-may, 2 jun-ago, 3 sep-nov. */
const MESES_ESTACION = [
  [12, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11],
];

const marcas = (n: number) => n.toString().padStart(2, "0");

/** Día del año hidrológico en SQL (0 = 1 de octubre; con hueco para el 29 de febrero, igual que diaHidrologico). */
export const DIA_SQL = `(CASE substr(fecha, 6, 2)
  WHEN '10' THEN 0 WHEN '11' THEN 31 WHEN '12' THEN 61 WHEN '01' THEN 92 WHEN '02' THEN 123 WHEN '03' THEN 152
  WHEN '04' THEN 183 WHEN '05' THEN 213 WHEN '06' THEN 244 WHEN '07' THEN 274 WHEN '08' THEN 305 ELSE 336 END
  + CAST(substr(fecha, 9, 2) AS INTEGER) - 1)`;

/** Trozo: lo normal de los días de un mes hidrológico (1991-2020). */
async function trozoNormal(db: D1Database, a: FilaAforo, m: number): Promise<void> {
  const meses = mesesConMargen(m);
  // raw(): filas como arrays [día, caudal], sin crear un objeto por fila
  const filas = await db
    .prepare(
      `SELECT ${DIA_SQL} AS dia, caudal FROM aforo_diario WHERE estacion = ? AND fecha BETWEEN ? AND ? AND caudal IS NOT NULL
       AND substr(fecha, 6, 2) IN (?, ?, ?)`,
    )
    .bind(a.slug, `${NORMAL_DESDE}-01-01`, `${NORMAL_HASTA}-12-31`, ...meses.map(marcas))
    .raw<[number, number]>();
  const [ini, fin] = diasDelMes(m);
  const filasNormal = percentilesDias(filas, ini, fin, [0.1, 0.25, 0.5, 0.75, 0.9]);
  const insertar = db.prepare("INSERT OR REPLACE INTO aforo_normal (estacion, dia, p10, p25, p50, p75, p90) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const borrar = db.prepare("DELETE FROM aforo_normal WHERE estacion = ? AND dia BETWEEN ? AND ?").bind(a.slug, ini, fin);
  await db.batch([borrar, ...filasNormal.map((f) => insertar.bind(a.slug, ...f))]);
}

/** Trozo: corrección del modelo para una estación del año. */
async function trozoCorreccion(db: D1Database, a: FilaAforo, s: number): Promise<void> {
  const celda = await celdaDelAforo(db, a);
  const modelo = await historicoModelo(celda);
  const filas = (
    await db
      .prepare(
        `SELECT fecha, caudal FROM aforo_diario WHERE estacion = ? AND fuente = 'anuario' AND fecha BETWEEN ? AND ? AND caudal IS NOT NULL
         AND substr(fecha, 6, 2) IN (?, ?, ?)`,
      )
      .bind(a.slug, CORRECCION_DESDE, CORRECCION_HASTA, ...MESES_ESTACION[s].map(marcas))
      .all<{ fecha: string; caudal: number }>()
  ).results;
  const c = cuantilesCorreccion(filas, modelo);
  await db.prepare("INSERT OR REPLACE INTO aforo_modelo (estacion, tipo, trozo, datos) VALUES (?, 'correccion', ?, ?)").bind(a.slug, s, c ? JSON.stringify(c) : null).run();
}

/** Trozo: lo normal del propio modelo para un mes (aforos sin histórico). */
async function trozoClima(db: D1Database, a: FilaAforo, m: number): Promise<void> {
  const modelo = await historicoModelo(await celdaDelAforo(db, a));
  const meses = mesesConMargen(m).map(marcas);
  const valores: [number, number][] = [];
  for (const [f, v] of modelo) if (meses.includes(f.slice(5, 7))) valores.push([diaHidrologico(f), v]);
  const [ini, fin] = diasDelMes(m);
  const datos = percentilesDias(valores, ini, fin, [0.5, 0.9]);
  await db.prepare("INSERT OR REPLACE INTO aforo_modelo (estacion, tipo, trozo, datos) VALUES (?, 'clima', ?, ?)").bind(a.slug, m, JSON.stringify(datos)).run();
}

/** Siguiente trozo pendiente de un aforo (número de bit), o null si ya está todo. */
export function siguienteTrozo(anuario: boolean, hechos: number): number | null {
  const necesarios = anuario ? NECESARIOS_ANUARIO : NECESARIOS_SIN_ANUARIO;
  for (let b = 0; b < 28; b++) if (necesarios & (1 << b) && !(hechos & (1 << b))) return b;
  return null;
}

/**
 * Hace como mucho «cuantos» trozos pendientes. Cuando un aforo termina todos los suyos, se rehace su resumen
 * (que ya es ligero: lo monta la base de datos).
 */
export async function avanzarCalculos(env: Env, cuantos: number): Promise<number> {
  let hechos = 0;
  while (hechos < cuantos) {
    const a = await env.DB.prepare(
      `SELECT * FROM aforos
       WHERE (anuario = 1 AND (calculos_hechos & ?) != ?) OR (anuario = 0 AND (calculos_hechos & ?) != ?)
       ORDER BY destacado DESC, orden LIMIT 1`,
    )
      .bind(NECESARIOS_ANUARIO, NECESARIOS_ANUARIO, NECESARIOS_SIN_ANUARIO, NECESARIOS_SIN_ANUARIO)
      .first<FilaAforo & { anuario: number; calculos_hechos: number }>();
    if (!a) break;
    const bit = siguienteTrozo(!!a.anuario, a.calculos_hechos)!;
    try {
      if (bit < BIT_CORRECCION) await trozoNormal(env.DB, a, bit - BIT_NORMAL);
      else if (bit < BIT_CLIMA) await trozoCorreccion(env.DB, a, bit - BIT_CORRECCION);
      else await trozoClima(env.DB, a, bit - BIT_CLIMA);
    } catch (e) {
      // Sin el modelo (por ejemplo, Open-Meteo no responde) se vuelve a intentar en la siguiente pasada
      console.error("cálculo aforo", a.slug, bit, e);
      break;
    }
    const nuevos = a.calculos_hechos | (1 << bit);
    await env.DB.prepare("UPDATE aforos SET calculos_hechos = ? WHERE slug = ?").bind(nuevos, a.slug).run();
    hechos++;
    if (siguienteTrozo(!!a.anuario, nuevos) === null) await calcularResumen(env.DB, { ...a, calculos_hechos: nuevos });
  }
  return hechos;
}
