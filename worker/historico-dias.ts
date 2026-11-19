// Días de histórico traídos de otra red (resumen diario ya hecho: AEMET, Weather Underground).
// Lo usan la cola de importaciones del worker y el script que importa de golpe desde el ordenador
// (scripts/importar-historicos.mjs): así los dos guardan exactamente lo mismo, con la misma regla.

/** Un día del resumen diario que viene de otra red. */
export interface DiaImportado {
  fecha: string;
  tmax: number | null;
  tmax_ts: number | null;
  tmin: number | null;
  tmin_ts: number | null;
  hum_max: number | null;
  hum_min: number | null;
  presion_max: number | null;
  presion_min: number | null;
  viento_max: number | null;
  racha_max: number | null;
  racha_max_ts: number | null;
  lluvia: number | null;
  radiacion_max: number | null;
  uv_max: number | null;
  /** Temperatura media del día */
  temp_media: number | null;
  /** Viento medio del día */
  viento_medio: number | null;
}

/** Origen que queda apuntado en el resumen (la página explica de dónde sale cada día) */
export type OrigenDia = "aemet" | "wu";

const COLUMNAS = [
  "tmax", "tmax_ts", "tmin", "tmin_ts", "hum_max", "hum_min", "presion_max", "presion_min", "viento_max",
  "racha_max", "racha_max_ts", "lluvia", "radiacion_max", "uv_max",
] as const;

/**
 * Inserta o actualiza un día. Regla: nunca pisa un día con datos propios de la estación (20 lecturas o más), ni uno que
 * venga de otra importación distinta (p. ej. de una hoja de cálculo); sí completa los días a medias (p. ej. el del alta).
 * 19 parámetros: estación, fecha, las 14 columnas, suma y número de la temperatura media… (ver valoresDia).
 */
export const SQL_DIA = `INSERT INTO resumen_diario (estacion_id, fecha, ${COLUMNAS.join(", ")}, temp_suma, temp_n, viento_suma, viento_n, lecturas, origen)
VALUES (?, ?, ${COLUMNAS.map(() => "?").join(", ")}, ?, ?, ?, ?, 0, ?)
ON CONFLICT (estacion_id, fecha) DO UPDATE SET ${COLUMNAS.map((c) => `${c} = excluded.${c}`).join(", ")},
  temp_suma = excluded.temp_suma, temp_n = excluded.temp_n, viento_suma = excluded.viento_suma, viento_n = excluded.viento_n,
  origen = excluded.origen
WHERE resumen_diario.lecturas < 20 AND coalesce(resumen_diario.origen, excluded.origen) = excluded.origen`;

/** Los valores de SQL_DIA, en orden. */
export function valoresDia(estacionId: number, d: DiaImportado, origen: OrigenDia): (number | string | null)[] {
  return [
    estacionId,
    d.fecha,
    ...COLUMNAS.map((c) => d[c]),
    d.temp_media,
    d.temp_media === null ? 0 : 1,
    d.viento_medio,
    d.viento_medio === null ? 0 : 1,
    origen,
  ];
}

/** Guarda días (en lotes). */
export async function guardarDias(db: D1Database, estacionId: number, origen: OrigenDia, dias: DiaImportado[]) {
  const sql = db.prepare(SQL_DIA);
  const lote = dias.map((d) => sql.bind(...valoresDia(estacionId, d, origen)));
  for (let i = 0; i < lote.length; i += 100) await db.batch(lote.slice(i, i + 100));
}

/** Un día de Weather Underground («history/daily», unidades métricas) → día importado; null si no tiene datos. */
export function diaWU(fecha: string, o: any): DiaImportado | null {
  const m = o?.metric;
  if (!m) return null;
  const v = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const presion = (x: unknown) => (typeof x === "number" && x >= 950 && x <= 1060 ? x : null);
  return {
    fecha,
    tmax: v(m.tempHigh),
    tmax_ts: null,
    tmin: v(m.tempLow),
    tmin_ts: null,
    hum_max: v(o.humidityHigh),
    hum_min: v(o.humidityLow),
    presion_max: presion(m.pressureMax),
    presion_min: presion(m.pressureMin),
    viento_max: v(m.windspeedHigh),
    racha_max: v(m.windgustHigh),
    racha_max_ts: null,
    lluvia: v(m.precipTotal),
    radiacion_max: v(o.solarRadiationHigh),
    uv_max: v(o.uvHigh),
    temp_media: v(m.tempAvg),
    viento_medio: v(m.windspeedAvg),
  };
}
