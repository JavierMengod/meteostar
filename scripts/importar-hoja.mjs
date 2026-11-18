// Genera el SQL con el histórico diario de una estación a partir de una hoja de cálculo propia (exportada a CSV).
// Uso: node scripts/importar-hoja.mjs <archivo.csv> <slug de la estación> [--hasta aaaa-mm-dd] > datos/hoja-<slug>.sql
//   p. ej. node scripts/importar-hoja.mjs Datos_diarios.csv villastar --hasta 2026-04-26 > datos/hoja-villastar.sql
// Columnas (por nombre, en este orden o en otro): Fecha, Lluvia, Temp Max, Temp Min, Temp media, Viento media,
//   Viento Max, Rafaga. Separador «,» o «;», decimales con punto o coma. La lluvia vacía cuenta como 0.
// Solo se añaden días que la estación aún no tiene (INSERT OR IGNORE): nunca pisa los datos que ya hay.
// Cada día queda marcado con origen = 'hoja' (sin horas de los extremos ni humedad, presión, radiación…).
// Después: npx wrangler d1 execute meteostar --file datos/hoja-<slug>.sql [--local | --remote]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const [archivo, slug] = args;
const hasta = args.includes("--hasta") ? args[args.indexOf("--hasta") + 1] : "9999-12-31";
if (!archivo || !/^[a-z0-9-]+$/.test(slug ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
  console.error("Uso: node scripts/importar-hoja.mjs <archivo.csv> <slug> [--hasta aaaa-mm-dd]");
  process.exit(1);
}

const lineas = readFileSync(archivo, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
const sep = lineas[0].includes(";") ? ";" : ",";
const partir = (l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
const cab = partir(lineas[0]).map((c) => c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " "));
const col = (...nombres) => {
  const i = cab.findIndex((c) => nombres.includes(c));
  if (i < 0) throw new Error(`Falta la columna ${nombres[0]}`);
  return i;
};
const C = {
  fecha: col("fecha"),
  lluvia: col("lluvia"),
  tmax: col("temp max"),
  tmin: col("temp min"),
  tmed: col("temp media"),
  vmed: col("viento media"),
  vmax: col("viento max"),
  racha: col("rafaga", "racha"),
};

/** Número con punto o coma decimal; null si no es un número (vacío, #VALUE!…). */
const num = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return null;
  // «1.234,5» → 1234.5 ; «12,7» → 12.7 ; «12.7» → 12.7
  const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(v) ? v : null;
};
const fecha = (s) => {
  // Número de serie de Excel (días desde el 30/12/1899), si la fecha se exportó sin formato
  if (/^\d{5}$/.test(String(s ?? "").trim())) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10);
  const m = String(s ?? "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) ?? String(s ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return m[1].length === 4 ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
const sql = (v) => (v === null ? "NULL" : String(Math.round(v * 100) / 100));

const filas = [];
const avisos = [];
for (const l of lineas.slice(1)) {
  const c = partir(l);
  const f = fecha(c[C.fecha]);
  if (!f || f > hasta) continue;
  const tmax = num(c[C.tmax]);
  const tmin = num(c[C.tmin]);
  if (tmax === null || tmin === null) {
    avisos.push(`${f}: sin máxima o mínima, no se importa`);
    continue;
  }
  if (tmin > tmax) {
    avisos.push(`${f}: la mínima es mayor que la máxima, no se importa`);
    continue;
  }
  const tmed = num(c[C.tmed]);
  const vmed = num(c[C.vmed]);
  let vmax = num(c[C.vmax]);
  const racha = num(c[C.racha]);
  // Viento máximo igual o menor que el medio: la celda está mal (p. ej. una fórmula copiada); se deja sin dato
  if (vmax !== null && vmed !== null && vmax <= vmed) vmax = null;
  filas.push({ f, lluvia: num(c[C.lluvia]) ?? 0, tmax, tmin, tmed: tmed !== null && tmed >= tmin - 0.1 && tmed <= tmax + 0.1 ? tmed : null, vmed, vmax, racha });
}

const estacion = `(SELECT id FROM estaciones WHERE slug = '${slug}')`;
console.log(`-- Histórico diario de «${slug}» importado de una hoja de cálculo (scripts/importar-hoja.mjs). ${filas.length} días.`);
console.log(`-- Solo añade los días que la estación no tiene: no pisa nada.`);
for (let i = 0; i < filas.length; i += 200) {
  const valores = filas.slice(i, i + 200).map(
    (d) =>
      `(${estacion}, '${d.f}', ${sql(d.tmax)}, ${sql(d.tmin)}, ${sql(d.lluvia)}, ${sql(d.racha)}, ${sql(d.vmax)}, ` +
      `${d.tmed === null ? "NULL, 0" : `${sql(d.tmed)}, 1`}, ${d.vmed === null ? "NULL, 0" : `${sql(d.vmed)}, 1`}, 0, 'hoja')`,
  );
  console.log(
    `INSERT OR IGNORE INTO resumen_diario (estacion_id, fecha, tmax, tmin, lluvia, racha_max, viento_max, temp_suma, temp_n, viento_suma, viento_n, lecturas, origen) VALUES\n${valores.join(",\n")};`,
  );
}
for (const a of avisos) console.error(`Aviso: ${a}`);
console.error(`${filas.length} días (${filas[0]?.f ?? "—"} → ${filas.at(-1)?.f ?? "—"})`);
