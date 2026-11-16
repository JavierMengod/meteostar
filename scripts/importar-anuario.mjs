// Genera el SQL con los datos diarios del Anuario de Aforos (MITECO / CEDEX) de las estaciones que usa Meteostar.
// Uso: node scripts/importar-anuario.mjs <carpeta JUCAR del anuario en CSV> > datos/anuario-aforos.sql
// Después: npx wrangler d1 execute meteostar --file datos/anuario-aforos.sql [--local | --remote]
// Fuente: «© Ministerio para la Transición Ecológica y el Reto Demográfico». Anuario de Aforos 2021-22.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Código ROEA de la estación → id en Meteostar */
const ESTACIONES = { 8015: "turia-teruel", 8027: "alfambra-teruel" };

const carpeta = process.argv[2];
if (!carpeta) {
  console.error("Falta la carpeta JUCAR del anuario");
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
console.error(`${diarios.length} días y ${instantaneos.length} máximos mensuales`);
