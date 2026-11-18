// Genera el SQL con los datos diarios del Anuario de Aforos (MITECO / CEDEX) de las estaciones que usa Meteostar.
// Uso: node scripts/importar-anuario.mjs <carpeta de la cuenca> <código>=<slug> [...] > datos/anuario-<cuenca>.sql
//   p. ej. node scripts/importar-anuario.mjs Anuario/JUCAR 08015=turia-teruel 08027=alfambra-teruel > datos/anuario-aforos.sql
//   El código es el del aforo (lo muestra Administración › Ríos) y el slug, el del río en Meteostar.
//   El anuario se descarga de https://www.miteco.gob.es/es/agua/temas/evaluacion-de-los-recursos-hidricos/sistema-informacion-anuario-aforos.html
//   (base de datos en CSV); cada cuenca va en su carpeta (JUCAR, EBRO…).
// Después: npx wrangler d1 execute meteostar --file datos/anuario-aforos.sql [--local | --remote]
// Después, la tarea de los aforos recalcula sola, por trozos, lo normal, los récords y la corrección de la previsión.
// Fuente: «© Ministerio para la Transición Ecológica y el Reto Demográfico». Anuario de Aforos 2021-22.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [carpeta, ...pares] = process.argv.slice(2);
/** Código del aforo (sin ceros a la izquierda, como en el anuario) → slug en Meteostar */
const ESTACIONES = Object.fromEntries(
  pares.map((p) => p.split("=")).filter(([c, s]) => c && s).map(([c, s]) => [String(Number(c)), s]),
);
if (!carpeta || !Object.keys(ESTACIONES).length) {
  console.error("Uso: node scripts/importar-anuario.mjs <carpeta de la cuenca> <código>=<slug> [...]");
  process.exit(1);
}

const num = (s) => {
  const v = Number(String(s ?? "").trim());
  return s !== undefined && String(s).trim() !== "" && Number.isFinite(v) ? v : null;
};
const sql = (v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v}'`);

function filas(fichero) {
  const lineas = readFileSync(join(carpeta, fichero), "latin1").split(/\r?\n/);
  const cab = lineas[0].split(";");
  return lineas.slice(1).filter(Boolean).map((l) => Object.fromEntries(l.split(";").map((v, i) => [cab[i], v])));
}

function insertar(tabla, columnas, valores) {
  const out = [];
  for (let i = 0; i < valores.length; i += 400) {
    const trozo = valores.slice(i, i + 400).map((v) => `(${v.map(sql).join(",")})`);
    out.push(`INSERT OR REPLACE INTO ${tabla} (${columnas.join(",")}) VALUES\n${trozo.join(",\n")};`);
  }
  return out.join("\n");
}

// Caudal y altura medios diarios
const diarios = [];
for (const f of filas("afliq.csv")) {
  const id = ESTACIONES[f.indroea];
  if (!id) continue;
  const [d, m, a] = f.fecha.split("/");
  const caudal = num(f.caudal);
  const nivel = num(f.altura);
  if (caudal === null && nivel === null) continue;
  diarios.push([id, `${a}-${m}-${d}`, caudal, nivel, "anuario"]);
}

// Caudal máximo instantáneo de cada mes
const instantaneos = [];
for (const f of filas("afliqi.csv")) {
  const id = ESTACIONES[f.indroea];
  const q = num(f.qci);
  if (!id || q === null) continue;
  const mes = `${f.anomes_ci.slice(0, 4)}-${f.anomes_ci.slice(4, 6)}`;
  const dia = num(f.dia_ci);
  instantaneos.push([id, mes, dia, q]);
}

console.log("-- Anuario de Aforos 2021-22 (MITECO / CEDEX). Generado por scripts/importar-anuario.mjs");
console.log(insertar("aforo_diario", ["estacion", "fecha", "caudal", "nivel", "fuente"], diarios));
console.log(insertar("aforo_max_mensual", ["estacion", "mes", "dia", "caudal"], instantaneos));
// Marca los ríos como «con histórico» y pone sus cálculos a cero: la tarea de los aforos los rehace por trozos
const lista = Object.values(ESTACIONES).map((x) => sql(x)).join(", ");
console.log(`UPDATE aforos SET anuario = 1, calculos_hechos = 0 WHERE slug IN (${lista});`);
console.log(`DELETE FROM aforo_normal WHERE estacion IN (${lista});`);
console.log(`DELETE FROM aforo_modelo WHERE estacion IN (${lista});`);
console.error(`${diarios.length} días y ${instantaneos.length} máximos mensuales`);
