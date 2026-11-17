// Histórico de los aforos: Anuario de Aforos (MITECO / CEDEX, validado) y medias diarias de las lecturas en tiempo
// real que guarda Meteostar. El resumen (lo normal, años, meses, récords y la corrección del modelo de previsión)
// se calcula una vez al día y se guarda en D1, para que cada visita lea una sola fila.
import { anioHidrologico, diaHidrologico } from "../shared/hidrologia";
import type { AnioAforo, CrecidaAforo, DiaAforo, ResumenAforo, RespuestaRio } from "../shared/tipos";
import { type FilaAforo, aforoPorSlug, aforosConfigurados, normalDeHoy } from "./aforos";
import { fechaLocal } from "./fechas";
import { calcularCorreccion, celdaDelAforo, climatologiaModelo, componerPrevision, historicoModelo, pedirReciente } from "./prevision-rio";

/** Periodo de referencia para «lo normal» (el normal climatológico de la OMM) */
export const NORMAL_DESDE = 1991;
export const NORMAL_HASTA = 2020;
/** Días con dato que necesita un año hidrológico para entrar en las comparaciones */
const DIAS_MINIMOS = 330;

type Fila = { fecha: string; caudal: number };
type Instantaneo = { mes: string; dia: number | null; caudal: number };
type Ctx = { waitUntil(p: Promise<unknown>): void };

function percentil(ordenados: number[], p: number): number {
  if (!ordenados.length) return NaN;
  const i = (ordenados.length - 1) * p;
  const a = Math.floor(i);
  const b = Math.ceil(i);
  return ordenados[a] + (ordenados[b] - ordenados[a]) * (i - a);
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Mayores caudales medios diarios, uno por episodio (separados al menos 10 días). */
function mayoresCrecidas(filas: Fila[]): CrecidaAforo[] {
  const crecidas: CrecidaAforo[] = [];
  for (const f of [...filas].sort((a, b) => b.caudal - a.caudal)) {
    if (crecidas.length >= 10) break;
    const t = Date.parse(f.fecha);
    if (crecidas.some((c) => Math.abs(Date.parse(c.fecha) - t) < 10 * 86400_000)) continue;
    crecidas.push({ fecha: f.fecha, caudal: r3(f.caudal) });
  }
  return crecidas;
}

const mayoresPuntas = (inst: Instantaneo[]): CrecidaAforo[] =>
  [...inst]
    .sort((a, b) => b.caudal - a.caudal)
    .slice(0, 10)
    .map((i) => ({ fecha: i.dia ? `${i.mes}-${String(i.dia).padStart(2, "0")}` : i.mes, caudal: r3(i.caudal) }));

/** Calcula el resumen de una estación a partir de sus caudales diarios. */
export function resumir(filas: Fila[], instantaneos: Instantaneo[], reguladoDesde: number | null = null): Omit<ResumenAforo, "estacion" | "correccion"> {
  // Lo normal para cada día del año hidrológico (ventana de ±7 días para suavizar)
  const porDia: number[][] = Array.from({ length: 366 }, () => []);
  const porMes: number[][] = Array.from({ length: 12 }, () => []);
  for (const f of filas) {
    const a = Number(f.fecha.slice(0, 4));
    if (a < NORMAL_DESDE || a > NORMAL_HASTA) continue;
    const d = diaHidrologico(f.fecha);
    for (let k = -7; k <= 7; k++) porDia[(d + k + 366) % 366].push(f.caudal);
    porMes[Number(f.fecha.slice(5, 7)) - 1].push(f.caudal);
  }
  const normal = porDia.map((v) => {
    v.sort((a, b) => a - b);
    return v.length ? ([0.1, 0.25, 0.5, 0.75, 0.9].map((p) => r3(percentil(v, p))) as [number, number, number, number, number]) : null;
  });
  const mesesNormal = porMes.map((v) => (v.length ? r3(v.reduce((a, b) => a + b, 0) / v.length) : null));

  // Años hidrológicos
  const porAnio = new Map<number, Fila[]>();
  for (const f of filas) {
    const a = anioHidrologico(f.fecha);
    if (!porAnio.has(a)) porAnio.set(a, []);
    porAnio.get(a)!.push(f);
  }
  const anios: AnioAforo[] = [];
  const disponibles: number[] = [];
  for (const [anio, dias] of [...porAnio.entries()].sort((a, b) => a[0] - b[0])) {
    disponibles.push(anio);
    if (dias.length < DIAS_MINIMOS) continue;
    const media = dias.reduce((s, d) => s + d.caudal, 0) / dias.length;
    const max = dias.reduce((m, d) => (d.caudal > m.caudal ? d : m));
    anios.push({ anio, media: r3(media), volumen: r1((media * 365.25 * 86400) / 1e6), maximo: r3(max.caudal), fechaMaximo: max.fecha, dias: dias.length });
  }

  const desdeRegulado = reguladoDesde ? `${reguladoDesde}-01-01` : null;
  return {
    normal,
    mesesNormal,
    periodoNormal: `${NORMAL_DESDE}–${NORMAL_HASTA}`,
    anios,
    disponibles,
    crecidas: mayoresCrecidas(filas),
    puntas: mayoresPuntas(instantaneos),
    reguladoDesde,
    crecidasRegulado: desdeRegulado ? mayoresCrecidas(filas.filter((f) => f.fecha >= desdeRegulado)) : [],
    puntasRegulado: desdeRegulado ? mayoresPuntas(instantaneos.filter((i) => i.mes >= desdeRegulado.slice(0, 7))) : [],
    desde: filas[0]?.fecha ?? null,
    hasta: filas.at(-1)?.fecha ?? null,
  };
}

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

export async function calcularResumen(db: D1Database, a: FilaAforo): Promise<ResumenAforo> {
  const filas = (
    await db.prepare("SELECT fecha, caudal, fuente FROM aforo_diario WHERE estacion = ? AND caudal IS NOT NULL ORDER BY fecha").bind(a.slug).all<Fila & { fuente: string }>()
  ).results;
  const inst = (await db.prepare("SELECT mes, dia, caudal FROM aforo_max_mensual WHERE estacion = ?").bind(a.slug).all<Instantaneo>()).results;
  // Corrección del modelo de previsión con los datos validados del anuario
  let correccion: ResumenAforo["correccion"] = null;
  const anuario = filas.filter((f) => f.fuente === "anuario");
  if (anuario.length > 1000) {
    try {
      const celda = await celdaDelAforo(db, a);
      correccion = calcularCorreccion(anuario, await historicoModelo(celda), celda);
    } catch (e) {
      console.error("corrección del modelo", a.slug, e);
    }
  }
  const resumen: ResumenAforo = { estacion: a.slug, ...resumir(filas, inst, a.regulado_desde), correccion };
  await db
    .prepare(
      "INSERT INTO aforo_resumen (estacion, datos, actualizado) VALUES (?, ?, unixepoch()) ON CONFLICT (estacion) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado",
    )
    .bind(a.slug, JSON.stringify(resumen))
    .run();
  const hoy = normalDeHoy(resumen);
  await db.prepare("UPDATE aforos SET normal_hoy = ? WHERE slug = ?").bind(hoy ? JSON.stringify(hoy) : null, a.slug).run();
  return resumen;
}

/** Tarea diaria: medias de ayer y resumen nuevo de cada aforo. */
export async function actualizarHistorico(env: Env): Promise<void> {
  await consolidarLecturas(env.DB);
  for (const a of await aforosConfigurados(env.DB)) {
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
  const r: ResumenAforo = JSON.parse(fila.datos);
  // Si se acaba de cargar el anuario de este río, el resumen se rehace ya, sin esperar a la tarea diaria
  if (!r.anios.length && (await env.DB.prepare("SELECT 1 FROM aforo_diario WHERE estacion = ? AND fuente = 'anuario' LIMIT 1").bind(slug).first())) {
    return calcularResumen(env.DB, a);
  }
  return r;
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
    normalModelo: conHistorico ? null : climatologiaModelo(await historicoModelo(celda)),
    medidos,
    ultimoMedido: ultimo?.caudal ?? null,
  });
}
