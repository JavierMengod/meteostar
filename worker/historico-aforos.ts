// Histórico de los aforos: Anuario de Aforos (MITECO / CEDEX, validado) y medias diarias de las lecturas en tiempo
// real que guarda Meteostar. El resumen (lo normal, años, meses, récords y lo del modelo de previsión) se monta una
// vez al día y se guarda en D1, para que cada visita lea una sola fila.
// Para no pasar de los 10 ms de CPU del plan gratuito, las sumas y medias las hace la base de datos, y lo pesado
// (lo normal de cada día y lo del modelo) se calcula una sola vez, por trozos (calculos-aforos.ts).
import { diaHidrologico } from "../shared/hidrologia";
import type { AnioAforo, CrecidaAforo, DiaAforo, ResumenAforo, RespuestaRio } from "../shared/tipos";
import { type FilaAforo, aforoPorSlug, normalDeHoy } from "./aforos";
import { fechaLocal } from "./fechas";
import { celdaDelAforo, componerPrevision, pedirReciente } from "./prevision-rio";

/** Periodo de referencia para «lo normal» (el normal climatológico de la OMM) */
export const NORMAL_DESDE = 1991;
export const NORMAL_HASTA = 2020;
/** Días con dato que necesita un año hidrológico para entrar en las comparaciones */
const DIAS_MINIMOS = 330;

type Fila = { fecha: string; caudal: number };
type Instantaneo = { mes: string; dia: number | null; caudal: number };
type Ctx = { waitUntil(p: Promise<unknown>): void };

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Mayores caudales medios diarios, uno por episodio (separados al menos 10 días), a partir de los candidatos ordenados. */
export function mayoresCrecidas(filas: Fila[]): CrecidaAforo[] {
  const crecidas: CrecidaAforo[] = [];
  for (const f of filas) {
    if (crecidas.length >= 10) break;
    const t = Date.parse(f.fecha);
    if (crecidas.some((c) => Math.abs(Date.parse(c.fecha) - t) < 10 * 86400_000)) continue;
    crecidas.push({ fecha: f.fecha, caudal: r3(f.caudal) });
  }
  return crecidas;
}

export const mayoresPuntas = (inst: Instantaneo[]): CrecidaAforo[] =>
  [...inst]
    .slice(0, 10)
    .map((i) => ({ fecha: i.dia ? `${i.mes}-${String(i.dia).padStart(2, "0")}` : i.mes, caudal: r3(i.caudal) }));

/** Pasa a medias diarias las lecturas en tiempo real de los días ya terminados (sin tocar los del anuario). */
export async function consolidarLecturas(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO aforo_diario (estacion, fecha, caudal, nivel, fuente)
       SELECT estacion, date(t, 'unixepoch') AS fecha, AVG(caudal), AVG(nivel), 'medido'
       FROM aforo_lecturas
       WHERE t < unixepoch(date('now'))
       GROUP BY estacion, fecha
       HAVING COUNT(caudal) >= 72
       ON CONFLICT (estacion, fecha) DO UPDATE SET caudal = excluded.caudal, nivel = excluded.nivel
       WHERE aforo_diario.fuente = 'medido'`,
    )
    .run();
  // Las lecturas cada 10 minutos solo se guardan algo más de un año; luego queda la media diaria
  await db.prepare("DELETE FROM aforo_lecturas WHERE t < unixepoch('now', '-400 days')").run();
}

/** Año hidrológico en SQL: de octubre a septiembre (2021 = de octubre de 2021 a septiembre de 2022). */
const ANIO_SQL = "CAST(substr(fecha, 1, 4) AS INTEGER) - (substr(fecha, 6, 2) < '10')";

/** Agrupa las filas de lo normal (una por día) en el formato del resumen. */
export function normalDeFilas(filas: { dia: number; p10: number; p25: number; p50: number; p75: number; p90: number }[]): ResumenAforo["normal"] {
  const normal: ResumenAforo["normal"] = Array.from({ length: 366 }, () => null);
  for (const f of filas) normal[f.dia] = [f.p10, f.p25, f.p50, f.p75, f.p90];
  return normal;
}

/** Lo del modelo guardado por trozos: la corrección (si están las 4 estaciones) y lo normal del modelo. */
export function modeloDeFilas(filas: { tipo: string; trozo: number; datos: string | null }[], celda: { lat: number; lon: number } | null): Pick<ResumenAforo, "correccion" | "climaModelo"> {
  const corr = filas.filter((f) => f.tipo === "correccion").sort((x, y) => x.trozo - y.trozo);
  const partes = corr.map((f) => (f.datos ? (JSON.parse(f.datos) as { modelo: number[]; aforo: number[] }) : null));
  const correccion =
    celda && partes.length === 4 && partes.every((p) => p !== null)
      ? { modelo: partes.map((p) => p!.modelo), aforo: partes.map((p) => p!.aforo), lat: celda.lat, lon: celda.lon }
      : null;
  const clima = filas.filter((f) => f.tipo === "clima" && f.datos);
  let climaModelo: ResumenAforo["climaModelo"] = null;
  if (clima.length) {
    climaModelo = Array.from({ length: 366 }, () => null);
    for (const f of clima) for (const [dia, n, alto] of JSON.parse(f.datos!) as [number, number, number][]) climaModelo[dia] = [n, alto];
  }
  return { correccion, climaModelo };
}

/**
 * Monta el resumen de un aforo. Las sumas, medias y máximos los calcula la base de datos; lo normal y lo del modelo
 * ya están calculados por trozos. Así el Worker apenas usa CPU.
 */
export async function calcularResumen(db: D1Database, a: FilaAforo): Promise<ResumenAforo> {
  const desdeRegulado = a.regulado_desde ? `${a.regulado_desde}-01-01` : null;
  const [normal, meses, anios, crecidas, crecidasReg, puntas, puntasReg, extremos, modelo] = await db.batch([
    db.prepare("SELECT dia, p10, p25, p50, p75, p90 FROM aforo_normal WHERE estacion = ?").bind(a.slug),
    db
      .prepare(
        `SELECT CAST(substr(fecha, 6, 2) AS INTEGER) AS mes, AVG(caudal) AS media FROM aforo_diario
         WHERE estacion = ? AND fecha BETWEEN ? AND ? AND caudal IS NOT NULL GROUP BY mes`,
      )
      .bind(a.slug, `${NORMAL_DESDE}-01-01`, `${NORMAL_HASTA}-12-31`),
    // En SQLite, con MAX(), las demás columnas son las de la fila del máximo: así sale su fecha
    db
      .prepare(
        `SELECT ${ANIO_SQL} AS anio, COUNT(*) AS dias, AVG(caudal) AS media, MAX(caudal) AS maximo, fecha AS fechaMaximo
         FROM aforo_diario WHERE estacion = ? AND caudal IS NOT NULL GROUP BY anio ORDER BY anio`,
      )
      .bind(a.slug),
    db.prepare("SELECT fecha, caudal FROM aforo_diario WHERE estacion = ? AND caudal IS NOT NULL ORDER BY caudal DESC LIMIT 400").bind(a.slug),
    db
      .prepare("SELECT fecha, caudal FROM aforo_diario WHERE estacion = ? AND fecha >= ? AND caudal IS NOT NULL ORDER BY caudal DESC LIMIT 400")
      .bind(a.slug, desdeRegulado ?? "9999"),
    db.prepare("SELECT mes, dia, caudal FROM aforo_max_mensual WHERE estacion = ? ORDER BY caudal DESC LIMIT 10").bind(a.slug),
    db.prepare("SELECT mes, dia, caudal FROM aforo_max_mensual WHERE estacion = ? AND mes >= ? ORDER BY caudal DESC LIMIT 10").bind(a.slug, desdeRegulado?.slice(0, 7) ?? "9999"),
    db.prepare("SELECT MIN(fecha) AS desde, MAX(fecha) AS hasta FROM aforo_diario WHERE estacion = ? AND caudal IS NOT NULL").bind(a.slug),
    db.prepare("SELECT tipo, trozo, datos FROM aforo_modelo WHERE estacion = ?").bind(a.slug),
  ]);
  const mesesNormal: (number | null)[] = Array.from({ length: 12 }, () => null);
  for (const m of meses.results as { mes: number; media: number }[]) mesesNormal[m.mes - 1] = r3(m.media);
  const filasAnios = anios.results as { anio: number; dias: number; media: number; maximo: number; fechaMaximo: string }[];
  const ext = extremos.results[0] as { desde: string | null; hasta: string | null } | undefined;
  const celda = a.celda_lat !== null && a.celda_lon !== null ? { lat: a.celda_lat, lon: a.celda_lon } : null;
  const resumen: ResumenAforo = {
    estacion: a.slug,
    normal: normalDeFilas(normal.results as any),
    mesesNormal,
    periodoNormal: `${NORMAL_DESDE}–${NORMAL_HASTA}`,
    anios: filasAnios
      .filter((x) => x.dias >= DIAS_MINIMOS)
      .map((x): AnioAforo => ({ anio: x.anio, media: r3(x.media), volumen: r1((x.media * 365.25 * 86400) / 1e6), maximo: r3(x.maximo), fechaMaximo: x.fechaMaximo, dias: x.dias })),
    disponibles: filasAnios.map((x) => x.anio),
    crecidas: mayoresCrecidas(crecidas.results as Fila[]),
    puntas: mayoresPuntas(puntas.results as Instantaneo[]),
    reguladoDesde: a.regulado_desde,
    crecidasRegulado: desdeRegulado ? mayoresCrecidas(crecidasReg.results as Fila[]) : [],
    puntasRegulado: desdeRegulado ? mayoresPuntas(puntasReg.results as Instantaneo[]) : [],
    ...modeloDeFilas(modelo.results as any, celda),
    modeloCalculado: null,
    desde: ext?.desde ?? null,
    hasta: ext?.hasta ?? null,
  };
  await db.batch([
    db
      .prepare(
        "INSERT INTO aforo_resumen (estacion, datos, actualizado) VALUES (?, ?, unixepoch()) ON CONFLICT (estacion) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado",
      )
      .bind(a.slug, JSON.stringify(resumen)),
    db.prepare("UPDATE aforos SET normal_hoy = ? WHERE slug = ?").bind(JSON.stringify(normalDeHoy(resumen)) ?? null, a.slug),
  ]);
  return resumen;
}

/** Tarea diaria: medias diarias de las lecturas de ayer (los resúmenes se rehacen poco a poco, ver refrescarResumenes). */
export async function actualizarHistorico(env: Env): Promise<void> {
  await consolidarLecturas(env.DB);
}

/**
 * Rehace los resúmenes que tienen más de un día, como mucho «cuantos» por llamada: así el trabajo se reparte entre
 * las pasadas de la tarea de los aforos y ninguna pasa de los límites de una ejecución del Worker.
 */
export async function refrescarResumenes(env: Env, cuantos: number): Promise<void> {
  const pendientes = (
    await env.DB.prepare(
      `SELECT a.* FROM aforos a LEFT JOIN aforo_resumen r ON r.estacion = a.slug
       WHERE r.actualizado IS NULL OR r.actualizado < unixepoch() - 23 * 3600
       ORDER BY r.actualizado IS NOT NULL, r.actualizado LIMIT ?`,
    )
      .bind(cuantos)
      .all<FilaAforo>()
  ).results;
  for (const a of pendientes) {
    try {
      await calcularResumen(env.DB, a);
    } catch (e) {
      console.error("resumen aforo", a.slug, e);
    }
  }
}

export async function resumenAforo(env: Env, slug: string): Promise<ResumenAforo | null> {
  const a = await aforoPorSlug(env.DB, slug);
  if (!a) return null;
  const fila = await env.DB.prepare("SELECT datos, actualizado FROM aforo_resumen WHERE estacion = ?").bind(slug).first<{ datos: string; actualizado: number }>();
  // Si no hay resumen o es de hace más de un día (por ejemplo, en local, sin tareas programadas), se calcula ahora
  if (!fila || Date.now() / 1000 - fila.actualizado > 26 * 3600) {
    await consolidarLecturas(env.DB);
    return calcularResumen(env.DB, a);
  }
  return JSON.parse(fila.datos);
}

/** Caudal de cada día de un año hidrológico. */
export async function anioAforo(env: Env, slug: string, anio: number): Promise<DiaAforo[]> {
  const filas = (
    await env.DB.prepare("SELECT fecha, caudal, fuente FROM aforo_diario WHERE estacion = ? AND fecha BETWEEN ? AND ? ORDER BY fecha")
      .bind(slug, `${anio}-10-01`, `${anio + 1}-09-30`)
      .all<{ fecha: string; caudal: number | null; fuente: string }>()
  ).results;
  return filas.map((f) => [f.fecha, f.caudal, f.fuente === "anuario" ? "a" : "m"]);
}

/** Previsión del caudal de un aforo, corregida con su histórico si lo tiene. */
export async function previsionAforo(env: Env, ctx: Ctx, slug: string): Promise<RespuestaRio | null> {
  const a = await aforoPorSlug(env.DB, slug);
  if (!a) return null;
  const resumen = await resumenAforo(env, slug);
  const celda = resumen?.correccion ?? (await celdaDelAforo(env.DB, a));
  const hoy = fechaLocal(Date.now() / 1000);
  const reciente = await pedirReciente(celda, ctx);
  // Medias diarias medidas de los últimos días (y la de hoy con lo que va de día)
  const medidos = new Map<string, number>();
  const diarios = (
    await env.DB.prepare("SELECT fecha, caudal FROM aforo_diario WHERE estacion = ? AND fecha >= date('now', '-25 days') AND caudal IS NOT NULL")
      .bind(slug)
      .all<{ fecha: string; caudal: number }>()
  ).results;
  for (const d of diarios) medidos.set(d.fecha, d.caudal);
  const deHoy = await env.DB.prepare("SELECT AVG(caudal) AS media FROM aforo_lecturas WHERE estacion = ? AND t >= unixepoch(date('now')) AND caudal IS NOT NULL")
    .bind(slug)
    .first<{ media: number | null }>();
  if (deHoy?.media != null) medidos.set(hoy, deHoy.media);
  const ultimo = await env.DB.prepare("SELECT caudal FROM aforo_lecturas WHERE estacion = ? AND caudal IS NOT NULL ORDER BY t DESC LIMIT 1")
    .bind(slug)
    .first<{ caudal: number }>();

  const conHistorico = !!resumen?.correccion && resumen.normal.some((x) => x !== null);
  return componerPrevision({
    reciente,
    hoy,
    correccion: resumen?.correccion ?? null,
    normalAforo: conHistorico
      ? (fecha) => {
          const p = resumen!.normal[diaHidrologico(fecha)];
          return p ? { normal: p[2], alto: p[4] } : null;
        }
      : null,
    normalModelo: conHistorico ? null : (fecha) => {
      const c = resumen?.climaModelo?.[diaHidrologico(fecha)];
      return c ? { normal: c[0], alto: c[1] } : null;
    },
    medidos,
    ultimoMedido: ultimo?.caudal ?? null,
  });
}
