// Acceso a la base de datos D1. Todas las lecturas y resúmenes son por estación.
import type { Extremo, Extremos, Lectura, PuntoHistorico, ResumenDiario, VientoMinuto } from "../shared/tipos";
import type { ExtremosDia } from "./conectores";
import { fechaLocal } from "./fechas";

const COLUMNAS = [
  "ts", "fuente", "temp", "hum", "rocio", "sensacion", "presion", "presion_abs", "viento", "racha",
  "dir", "lluvia_dia", "intensidad", "radiacion", "uv", "temp_int", "hum_int", "rayos", "rayos_dist", "rayos_ts",
] as const satisfies readonly (keyof Lectura)[];

/** Días que se conservan las lecturas al minuto. */
export const DIAS_LECTURAS = 8;

/**
 * Guarda una lectura y actualiza el resumen del día.
 * Las del envío directo sustituyen a cualquier otra del mismo minuto; las de las API nunca pisan nada.
 * Devuelve true si se ha guardado.
 */
export async function guardarLectura(db: D1Database, estacionId: number, l: Lectura): Promise<boolean> {
  const directa = l.fuente === "directo" || l.fuente === "push";
  const verbo = directa ? "INSERT OR REPLACE" : "INSERT OR IGNORE";
  const sql = `${verbo} INTO lecturas (estacion_id, ${COLUMNAS.join(", ")}) VALUES (?, ${COLUMNAS.map(() => "?").join(", ")})`;
  // Los campos que una fuente no da (p. ej. los rayos) van como NULL
  const r = await db.prepare(sql).bind(estacionId, ...COLUMNAS.map((c) => l[c] ?? null)).run();
  if (!r.meta.changes) return false;
  await actualizarResumen(db, estacionId, l);
  return true;
}

// Campos del resumen: [columna del resumen, columna de la lectura, 'max' | 'min', guarda la hora]
const CAMPOS_RESUMEN: [keyof ResumenDiario, keyof Lectura, "max" | "min", boolean][] = [
  ["tmax", "temp", "max", true],
  ["tmin", "temp", "min", true],
  ["hum_max", "hum", "max", false],
  ["hum_min", "hum", "min", false],
  ["presion_max", "presion", "max", false],
  ["presion_min", "presion", "min", false],
  ["viento_max", "viento", "max", false],
  ["racha_max", "racha", "max", true],
  ["lluvia", "lluvia_dia", "max", false],
  ["intensidad_max", "intensidad", "max", true],
  ["radiacion_max", "radiacion", "max", false],
  ["uv_max", "uv", "max", false],
  ["rayos", "rayos", "max", false],
];

/** INSERT … ON CONFLICT que solo mejora los extremos (más alto en los máximos, más bajo en los mínimos). */
const SQL_RESUMEN = (() => {
  const cols: string[] = ["estacion_id", "fecha", "lecturas"];
  const sets: string[] = ["lecturas = lecturas + excluded.lecturas"];
  for (const [col, , tipo, conHora] of CAMPOS_RESUMEN) {
    const mejora = `excluded.${col} IS NOT NULL AND (${col} IS NULL OR excluded.${col} ${tipo === "max" ? ">" : "<"} ${col})`;
    cols.push(col);
    sets.push(`${col} = CASE WHEN ${mejora} THEN excluded.${col} ELSE ${col} END`);
    if (conHora) {
      cols.push(`${col}_ts`);
      sets.push(`${col}_ts = CASE WHEN ${mejora} THEN excluded.${col}_ts ELSE ${col}_ts END`);
    }
  }
  // Sumas para las medias del día (temperatura y viento): se van acumulando
  for (const col of ["temp_suma", "temp_n", "viento_suma", "viento_n"]) {
    cols.push(col);
    sets.push(`${col} = coalesce(${col}, 0) + coalesce(excluded.${col}, 0)`);
  }
  return `INSERT INTO resumen_diario (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})
    ON CONFLICT(estacion_id, fecha) DO UPDATE SET ${sets.join(", ")}`;
})();

/** [suma de temperaturas, nº de temperaturas, suma de viento, nº de vientos] */
type Sumas = [number | null, number, number | null, number];
const sumasDe = (lecturas: Lectura[]): Sumas => {
  const t = lecturas.map((l) => l.temp).filter((v): v is number => v !== null && v !== undefined);
  const v = lecturas.map((l) => l.viento).filter((x): x is number => x !== null && x !== undefined);
  return [t.length ? t.reduce((a, b) => a + b, 0) : null, t.length, v.length ? v.reduce((a, b) => a + b, 0) : null, v.length];
};
const SIN_SUMAS: Sumas = [null, 0, null, 0];

function valoresResumen(
  estacionId: number,
  fecha: string,
  lecturas: number,
  valor: (campo: keyof Lectura, col: keyof ResumenDiario) => number | null,
  ts: number | null,
  sumas: Sumas,
) {
  const valores: unknown[] = [estacionId, fecha, lecturas];
  for (const [col, campo, , conHora] of CAMPOS_RESUMEN) {
    const v = valor(campo, col);
    valores.push(v ?? null);
    if (conHora) valores.push(v === null || v === undefined ? null : ts);
  }
  valores.push(...sumas);
  return valores;
}

async function actualizarResumen(db: D1Database, estacionId: number, l: Lectura) {
  await db
    .prepare(SQL_RESUMEN)
    .bind(...valoresResumen(estacionId, fechaLocal(l.ts), 1, (campo) => l[campo] as number | null, l.ts, sumasDe([l])))
    .run();
}

/**
 * Mezcla en el resumen de un día los extremos de muchas lecturas a la vez (importación de históricos): una sola
 * consulta por día, con la hora de cada extremo.
 */
export async function fusionarResumenDia(db: D1Database, estacionId: number, fecha: string, lecturas: Lectura[]) {
  if (!lecturas.length) return;
  const mejor = new Map<keyof ResumenDiario, { v: number; ts: number }>();
  for (const l of lecturas) {
    for (const [col, campo, tipo] of CAMPOS_RESUMEN) {
      const v = l[campo] as number | null;
      if (v === null || v === undefined) continue;
      const m = mejor.get(col);
      if (!m || (tipo === "max" ? v > m.v : v < m.v)) mejor.set(col, { v, ts: l.ts });
    }
  }
  const valores: unknown[] = [estacionId, fecha, lecturas.length];
  for (const [col, , , conHora] of CAMPOS_RESUMEN) {
    const m = mejor.get(col);
    valores.push(m?.v ?? null);
    if (conHora) valores.push(m?.ts ?? null);
  }
  // Las sumas de las medias no se acumulan aquí (repetir una importación las duplicaría): se ponen las del día
  // importado si tiene al menos tantas lecturas como las que ya había
  valores.push(...SIN_SUMAS);
  const [ts, tn, vs, vn] = sumasDe(lecturas);
  // Lluvia y rayos del día: el valor más alto de su contador (ya puesto a cero a medianoche), sin mezclar con lo que
  // hubiera (una importación anterior podía tenerlo inflado)
  const maximo = (k: "lluvia_dia" | "rayos") => {
    const v = lecturas.map((l) => l[k]).filter((x): x is number => typeof x === "number");
    return v.length ? Math.max(...v) : null;
  };
  await db.batch([
    db.prepare(SQL_RESUMEN).bind(...valores),
    db
      .prepare(
        `UPDATE resumen_diario SET temp_suma = ?, temp_n = ?, viento_suma = ?, viento_n = ?, lluvia = ?, rayos = ?
         WHERE estacion_id = ? AND fecha = ? AND coalesce(temp_n, 0) <= ?`,
      )
      .bind(ts, tn, vs, vn, maximo("lluvia_dia"), maximo("rayos"), estacionId, fecha, tn),
  ]);
}

/**
 * Guarda muchas lecturas con pocas consultas (importación de históricos): varias filas por sentencia, con los
 * valores escritos en la propia sentencia (solo números, que se comprueban). Nunca pisa lecturas que ya existan.
 */
export async function guardarLecturasLote(db: D1Database, estacionId: number, lecturas: Lectura[], fuente: string) {
  if (!/^[a-z_]+$/.test(fuente)) throw new Error("Fuente no válida");
  const valor = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "NULL");
  const filas = lecturas.map(
    (l) => `(${estacionId}, ${valor(l.ts)}, '${fuente}', ${COLUMNAS.filter((c) => c !== "ts" && c !== "fuente").map((c) => valor(l[c])).join(", ")})`,
  );
  const cols = COLUMNAS.filter((c) => c !== "ts" && c !== "fuente");
  const sentencias = [];
  for (let i = 0; i < filas.length; i += 150) {
    sentencias.push(db.prepare(`INSERT OR IGNORE INTO lecturas (estacion_id, ts, fuente, ${cols.join(", ")}) VALUES ${filas.slice(i, i + 150).join(", ")}`));
  }
  if (sentencias.length) await db.batch(sentencias);
}

/** Mezcla en el resumen de hoy los extremos que da la propia fuente (sin hora conocida). */
export async function guardarExtremosDia(db: D1Database, estacionId: number, fecha: string, ex: ExtremosDia) {
  await db
    .prepare(SQL_RESUMEN)
    .bind(...valoresResumen(estacionId, fecha, 0, (_c, col) => (ex as Record<string, number | null>)[col] ?? null, null, SIN_SUMAS))
    .run();
}

export async function ultimaLectura(db: D1Database, estacionId: number): Promise<Lectura | null> {
  return db.prepare("SELECT * FROM lecturas WHERE estacion_id = ? ORDER BY ts DESC LIMIT 1").bind(estacionId).first<Lectura>();
}

export async function resumen(db: D1Database, estacionId: number, fecha: string): Promise<ResumenDiario | null> {
  return db.prepare("SELECT * FROM resumen_diario WHERE estacion_id = ? AND fecha = ?").bind(estacionId, fecha).first<ResumenDiario>();
}

export async function resumenes(db: D1Database, estacionId: number, desde: string): Promise<ResumenDiario[]> {
  const r = await db
    .prepare("SELECT * FROM resumen_diario WHERE estacion_id = ? AND fecha >= ? ORDER BY fecha")
    .bind(estacionId, desde)
    .all<ResumenDiario>();
  return r.results;
}

/** Medias de 5 minutos desde un instante. */
export async function historico(db: D1Database, estacionId: number, desde: number): Promise<PuntoHistorico[]> {
  const r = await db
    .prepare(
      `SELECT (ts / 300) * 300 AS t,
        round(avg(temp), 1) AS temp, round(avg(rocio), 1) AS rocio, round(avg(hum)) AS hum,
        round(avg(presion), 1) AS presion, round(avg(viento), 1) AS viento, max(racha) AS racha,
        max(CASE WHEN ts % 300 = 0 THEN dir END) AS dir,
        max(lluvia_dia) AS lluvia_dia, max(intensidad) AS intensidad,
        round(avg(radiacion)) AS radiacion, max(uv) AS uv, max(rayos) AS rayos, max(rayos_dist) AS rayos_dist
      FROM lecturas WHERE estacion_id = ? AND ts >= ? GROUP BY t ORDER BY t`,
    )
    .bind(estacionId, desde)
    .all<PuntoHistorico>();
  return r.results;
}

/** Temperatura media cada 15 minutos (gráfica comparativa de la red). */
export async function serieTemperatura(db: D1Database, estacionId: number, desde: number): Promise<[number, number | null][]> {
  const r = await db
    .prepare("SELECT (ts / 900) * 900 AS t, round(avg(temp), 1) AS v FROM lecturas WHERE estacion_id = ? AND ts >= ? GROUP BY t ORDER BY t")
    .bind(estacionId, desde)
    .all<{ t: number; v: number | null }>();
  return r.results.map((x) => [x.t, x.v]);
}

export async function borrarAntiguas(db: D1Database, ahora: number) {
  await db.prepare("DELETE FROM lecturas WHERE ts < ?").bind(ahora - DIAS_LECTURAS * 86400).run();
  await db.prepare("DELETE FROM sesiones WHERE caduca < ?").bind(ahora).run();
}

/** Lectura más cercana a un instante (con un margen de ±10 minutos, o ±40 para fuentes horarias). */
export async function lecturaCerca(db: D1Database, estacionId: number, ts: number, margen = 600): Promise<Lectura | null> {
  return db
    .prepare("SELECT * FROM lecturas WHERE estacion_id = ? AND ts BETWEEN ? AND ? ORDER BY abs(ts - ?) LIMIT 1")
    .bind(estacionId, ts - margen, ts + margen, ts)
    .first<Lectura>();
}

export async function vientoDesde(db: D1Database, estacionId: number, desde: number): Promise<VientoMinuto[]> {
  const r = await db
    .prepare("SELECT dir, viento, racha FROM lecturas WHERE estacion_id = ? AND ts >= ? ORDER BY ts")
    .bind(estacionId, desde)
    .all<VientoMinuto>();
  return r.results;
}

export async function mediaVientoDesde(db: D1Database, estacionId: number, desde: number): Promise<number | null> {
  return db.prepare("SELECT round(avg(viento), 1) AS v FROM lecturas WHERE estacion_id = ? AND ts >= ?").bind(estacionId, desde).first<number>("v");
}

export async function lluviaEntre(db: D1Database, estacionId: number, desde: string, hasta: string): Promise<number | null> {
  return db
    .prepare("SELECT round(sum(lluvia), 1) AS v FROM resumen_diario WHERE estacion_id = ? AND fecha BETWEEN ? AND ?")
    .bind(estacionId, desde, hasta)
    .first<number>("v");
}

export async function primerDia(db: D1Database, estacionId: number): Promise<string | null> {
  return db.prepare("SELECT min(fecha) AS f FROM resumen_diario WHERE estacion_id = ?").bind(estacionId).first<string>("f");
}

// [clave en Extremos, columna, orden, columna con la hora]
const EXTREMOS: [keyof Extremos, keyof ResumenDiario, "DESC" | "ASC", keyof ResumenDiario | null][] = [
  ["tmax", "tmax", "DESC", "tmax_ts"],
  ["tmin", "tmin", "ASC", "tmin_ts"],
  ["hum_min", "hum_min", "ASC", null],
  ["viento_max", "viento_max", "DESC", null],
  ["racha_max", "racha_max", "DESC", "racha_max_ts"],
  ["presion_max", "presion_max", "DESC", null],
  ["presion_min", "presion_min", "ASC", null],
  ["lluvia_dia_max", "lluvia", "DESC", null],
  ["intensidad_max", "intensidad_max", "DESC", "intensidad_max_ts"],
  ["radiacion_max", "radiacion_max", "DESC", null],
  ["uv_max", "uv_max", "DESC", null],
];

/** Extremos, medias y totales entre dos fechas (incluidas), a partir del resumen diario. */
export async function extremos(db: D1Database, estacionId: number, desde: string, hasta: string): Promise<Extremos> {
  const consultas = EXTREMOS.map(([, col, orden, colTs]) =>
    db
      .prepare(
        `SELECT ${col} AS valor, fecha, ${colTs ?? "NULL"} AS ts FROM resumen_diario
         WHERE estacion_id = ? AND fecha BETWEEN ? AND ? AND ${col} IS NOT NULL ORDER BY ${col} ${orden}, fecha LIMIT 1`,
      )
      .bind(estacionId, desde, hasta),
  );
  consultas.push(
    db
      .prepare(
        `SELECT round(avg(tmax), 1) AS media_tmax, round(avg(tmin), 1) AS media_tmin, round(sum(lluvia), 1) AS lluvia_total,
           count(CASE WHEN lluvia >= 0.2 THEN 1 END) AS dias_lluvia, count(*) AS dias
         FROM resumen_diario WHERE estacion_id = ? AND fecha BETWEEN ? AND ?`,
      )
      .bind(estacionId, desde, hasta),
    db
      .prepare(
        `SELECT substr(fecha, 1, 7) AS mes, round(sum(lluvia), 1) AS valor FROM resumen_diario
         WHERE estacion_id = ? AND fecha BETWEEN ? AND ? GROUP BY mes HAVING valor > 0 ORDER BY valor DESC LIMIT 1`,
      )
      .bind(estacionId, desde, hasta),
  );
  const r = await db.batch(consultas);
  const resultado = {} as Extremos;
  EXTREMOS.forEach(([clave], i) => {
    (resultado as any)[clave] = (r[i].results[0] as Extremo | undefined) ?? null;
  });
  const agregados = r[EXTREMOS.length].results[0] as any;
  Object.assign(resultado, {
    media_tmax: agregados?.media_tmax ?? null,
    media_tmin: agregados?.media_tmin ?? null,
    lluvia_total: agregados?.lluvia_total ?? null,
    dias_lluvia: agregados?.dias_lluvia ?? 0,
    dias: agregados?.dias ?? 0,
    mes_mas_lluvioso: (r[EXTREMOS.length + 1].results[0] as any) ?? null,
  });
  return resultado;
}
