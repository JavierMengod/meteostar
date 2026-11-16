// Histórico de los aforos: Anuario de Aforos (MITECO / CEDEX, validado, hasta septiembre de 2022) y medias diarias
// de las lecturas en tiempo real que guarda Meteostar. El resumen (lo normal, años, meses y récords) se calcula
// una vez al día y se guarda en D1, para que cada visita lea una sola fila.
import type {
  AnioAforo,
  CrecidaAforo,
  DiaAforo,
  ResumenAforo,
} from "../shared/tipos";
import { anioHidrologico, diaHidrologico } from "../shared/hidrologia";
import { AFOROS } from "./aforos";

/** Periodo de referencia para «lo normal» (el normal climatológico de la OMM) */
export const NORMAL_DESDE = 1991;
export const NORMAL_HASTA = 2020;
/** Días con dato que necesita un año hidrológico para entrar en las comparaciones */
const DIAS_MINIMOS = 330;

type Fila = { fecha: string; caudal: number };

function percentil(ordenados: number[], p: number): number {
  if (!ordenados.length) return NaN;
  const i = (ordenados.length - 1) * p;
  const a = Math.floor(i);
  const b = Math.ceil(i);
  return ordenados[a] + (ordenados[b] - ordenados[a]) * (i - a);
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Calcula el resumen de una estación a partir de sus caudales diarios. */
export function resumir(
  filas: Fila[],
  instantaneos: { mes: string; dia: number | null; caudal: number }[],
): Omit<ResumenAforo, "estacion"> {
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
    return v.length
      ? ([0.1, 0.25, 0.5, 0.75, 0.9].map((p) => r3(percentil(v, p))) as [
          number,
          number,
          number,
          number,
          number,
        ])
      : null;
  });
  const mesesNormal = porMes.map((v) =>
    v.length ? r3(v.reduce((a, b) => a + b, 0) / v.length) : null,
  );

  // Años hidrológicos
  const porAnio = new Map<number, Fila[]>();
  for (const f of filas) {
    const a = anioHidrologico(f.fecha);
    if (!porAnio.has(a)) porAnio.set(a, []);
    porAnio.get(a)!.push(f);
  }
  const anios: AnioAforo[] = [];
  const disponibles: number[] = [];
  for (const [anio, dias] of [...porAnio.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    disponibles.push(anio);
    if (dias.length < DIAS_MINIMOS) continue;
    const media = dias.reduce((s, d) => s + d.caudal, 0) / dias.length;
    const max = dias.reduce((m, d) => (d.caudal > m.caudal ? d : m));
    anios.push({
      anio,
      media: r3(media),
      volumen: r1((media * 365.25 * 86400) / 1e6),
      maximo: r3(max.caudal),
      fechaMaximo: max.fecha,
      dias: dias.length,
    });
  }

  // Mayores crecidas por caudal medio diario (episodios separados al menos 10 días)
  const ordenadas = [...filas].sort((a, b) => b.caudal - a.caudal);
  const crecidas: CrecidaAforo[] = [];
  for (const f of ordenadas) {
    if (crecidas.length >= 10) break;
    const t = Date.parse(f.fecha);
    if (
      crecidas.some((c) => Math.abs(Date.parse(c.fecha) - t) < 10 * 86400_000)
    )
      continue;
    crecidas.push({ fecha: f.fecha, caudal: r3(f.caudal) });
  }
  // Mayores caudales instantáneos (máximo de cada mes en el anuario)
  const puntas: CrecidaAforo[] = [...instantaneos]
    .sort((a, b) => b.caudal - a.caudal)
    .slice(0, 10)
    .map((i) => ({
      fecha: i.dia ? `${i.mes}-${String(i.dia).padStart(2, "0")}` : i.mes,
      caudal: r3(i.caudal),
    }));

  return {
    normal,
    mesesNormal,
    periodoNormal: `${NORMAL_DESDE}–${NORMAL_HASTA}`,
    anios,
    disponibles,
    crecidas,
    puntas,
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
  await db
    .prepare(
      "DELETE FROM aforo_lecturas WHERE t < unixepoch('now', '-400 days')",
    )
    .run();
}

export async function calcularResumen(
  db: D1Database,
  estacion: string,
): Promise<ResumenAforo> {
  const filas = (
    await db
      .prepare(
        "SELECT fecha, caudal FROM aforo_diario WHERE estacion = ? AND caudal IS NOT NULL ORDER BY fecha",
      )
      .bind(estacion)
      .all<Fila>()
  ).results;
  const inst = (
    await db
      .prepare(
        "SELECT mes, dia, caudal FROM aforo_max_mensual WHERE estacion = ?",
      )
      .bind(estacion)
      .all<{ mes: string; dia: number | null; caudal: number }>()
  ).results;
  const resumen: ResumenAforo = { estacion, ...resumir(filas, inst) };
  await db
    .prepare(
      "INSERT INTO aforo_resumen (estacion, datos, actualizado) VALUES (?, ?, unixepoch()) ON CONFLICT (estacion) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado",
    )
    .bind(estacion, JSON.stringify(resumen))
    .run();
  return resumen;
}

/** Tarea diaria: medias de ayer y resumen nuevo. */
export async function actualizarHistorico(env: Env): Promise<void> {
  await consolidarLecturas(env.DB);
  for (const a of AFOROS) await calcularResumen(env.DB, a.id);
}

export async function resumenAforo(
  env: Env,
  estacion: string,
): Promise<ResumenAforo | null> {
  if (!AFOROS.some((a) => a.id === estacion)) return null;
  const fila = await env.DB.prepare(
    "SELECT datos, actualizado FROM aforo_resumen WHERE estacion = ?",
  )
    .bind(estacion)
    .first<{ datos: string; actualizado: number }>();
  // Si no hay resumen o es de hace más de un día (por ejemplo, en local, sin tareas programadas), se calcula ahora
  if (!fila || Date.now() / 1000 - fila.actualizado > 26 * 3600) {
    await consolidarLecturas(env.DB);
    return calcularResumen(env.DB, estacion);
  }
  return JSON.parse(fila.datos);
}

/** Caudal de cada día de un año hidrológico. */
export async function anioAforo(
  env: Env,
  estacion: string,
  anio: number,
): Promise<DiaAforo[]> {
  const filas = (
    await env.DB.prepare(
      "SELECT fecha, caudal, fuente FROM aforo_diario WHERE estacion = ? AND fecha BETWEEN ? AND ? ORDER BY fecha",
    )
      .bind(estacion, `${anio}-10-01`, `${anio + 1}-09-30`)
      .all<{ fecha: string; caudal: number | null; fuente: string }>()
  ).results;
  return filas.map((f) => [
    f.fecha,
    f.caudal,
    f.fuente === "anuario" ? "a" : "m",
  ]);
}
