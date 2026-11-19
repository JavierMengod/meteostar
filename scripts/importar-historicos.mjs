// Importa DE GOLPE, desde el ordenador, el histórico pendiente de la cola de importaciones (tabla «importaciones»):
// AEMET (valores climatológicos diarios) y Weather Underground (resumen de cada día).
//
// Hace lo mismo que la cola del worker (con el mismo código para convertir y guardar los días: worker/historico-dias.ts
// y worker/aemet.ts), pero sin los límites de Cloudflare: encadena las peticiones tan rápido como deja cada red. La cola
// se queda para las estaciones que se den de alta después; las que este script termina quedan marcadas como hechas.
//
// Uso:
//   node scripts/importar-historicos.mjs [--remote] [--solo <slug>] [--red aemet|wunderground] [--max-filas N] [--max-wu N]
//     --remote      en la base de datos de producción (por defecto, la local)
//     --solo        solo esa estación
//     --max-filas   tope de días a escribir en esta ejecución (D1 gratuito: 100.000 filas escritas al día). 80.000 por defecto
//     --max-wu      tope de peticiones a Weather Underground (la clave da unas 1.500 al día, compartidas con la web). 800
// Las claves: AEMET_API_KEY y WU_API_KEY (del entorno o de .dev.vars).
// ecowitt.net no va aquí: sus claves están cifradas en la base de datos; ese histórico lo trae la cola (y es rápido).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const args = process.argv.slice(2);
const opcion = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const remoto = args.includes("--remote");
const solo = opcion("--solo");
const soloRed = opcion("--red");
const maxFilas = Number(opcion("--max-filas") ?? 80000);
const maxWU = Number(opcion("--max-wu") ?? 800);
const destino = remoto ? "--remote" : "--local";

const deVars = (k) => {
  try {
    return (readFileSync(".dev.vars", "utf8").match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^"|"$/g, "");
  } catch {
    return "";
  }
};
const CLAVE_AEMET = process.env.AEMET_API_KEY || deVars("AEMET_API_KEY");
const CLAVE_WU = process.env.WU_API_KEY || deVars("WU_API_KEY");

// El mismo código del worker para convertir y guardar los días
const { outputFiles } = await build({
  stdin: {
    contents: `export { diaClimatologico } from "./worker/aemet.ts"; export { SQL_DIA, valoresDia, diaWU } from "./worker/historico-dias.ts";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "neutral",
  write: false,
  logLevel: "error",
});
const { diaClimatologico, SQL_DIA, valoresDia, diaWU } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const sumarDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function d1(sqlOFichero, esFichero = false) {
  // wrangler con el propio node (sin shell: en Windows, npx partiría la consulta en trozos)
  const salida = execFileSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "meteostar", destino, "--json", "--yes", ...(esFichero ? ["--file", sqlOFichero] : ["--command", sqlOFichero])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(salida.slice(salida.indexOf("[")))[0]?.results ?? [];
}

/** Literal SQL de un valor (solo números, textos sin comillas raras y NULL). */
const literal = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : `'${String(v).replaceAll("'", "''")}'`);
/** SQL_DIA con los valores puestos (en lugar de los «?») */
const sentencia = (valores) => {
  let i = 0;
  return SQL_DIA.replace(/\?/g, () => literal(valores[i++])) + ";";
};

/** AEMET OpenData: dos pasos; si pide una pausa (límite por minuto), espera y repite. */
async function pedirAemet(ruta) {
  for (let intento = 0; intento < 20; intento++) {
    const r1 = await fetch(`https://opendata.aemet.es/opendata/api${ruta}`, { headers: { api_key: CLAVE_AEMET } });
    const p = JSON.parse(new TextDecoder("iso-8859-15").decode(await r1.arrayBuffer()));
    if (p?.estado === 404 || /no hay datos/i.test(p?.descripcion ?? "")) return [];
    if (r1.status === 429 || /l.mite/i.test(p?.descripcion ?? "")) {
      process.stdout.write(" (AEMET pide una pausa: 1 min)");
      await espera(61_000);
      continue;
    }
    if (p?.estado !== 200 || !p.datos) throw new Error(`AEMET: ${p?.descripcion ?? `HTTP ${r1.status}`}`);
    const r2 = await fetch(p.datos);
    if (r2.status === 429) {
      await espera(61_000);
      continue;
    }
    if (!r2.ok) throw new Error(`AEMET HTTP ${r2.status}`);
    return JSON.parse(new TextDecoder("iso-8859-15").decode(await r2.arrayBuffer()));
  }
  throw new Error("AEMET no deja seguir");
}

/** Todo el histórico de AEMET de una estación, desde «cursor» hacia atrás (mismas reglas que la cola). */
async function historicoAemet(imp) {
  const dias = [];
  let fin = imp.cursor;
  let vacios = imp.vacios;
  while (fin) {
    const ini = sumarDias(fin, -179);
    const lista = await pedirAemet(`/valores/climatologicos/diarios/datos/fechaini/${ini}T00:00:00UTC/fechafin/${fin}T23:59:59UTC/estacion/${encodeURIComponent(imp.codigo)}`);
    const filas = lista.map((o) => diaClimatologico(o, imp.altitud)).filter((d) => d.tmax !== null || d.lluvia !== null);
    dias.push(...filas);
    process.stdout.write(`\r  ${imp.slug}: hasta ${ini} · ${dias.length} días   `);
    vacios = filas.length ? 0 : vacios + 1;
    fin = vacios >= 2 || ini <= "1920-01-01" ? null : sumarDias(ini, -1);
    if (dias.length >= filasQuedan) break; // tope de escrituras de hoy: se sigue otro día (o la cola)
  }
  return { dias, cursor: fin, vacios, origen: "aemet" };
}

let peticionesWU = 0;
/** Histórico de Weather Underground de una estación, un día por petición, hasta el tope de peticiones. */
async function historicoWU(imp) {
  const dias = [];
  let dia = imp.cursor;
  let vacios = imp.vacios;
  while (dia && peticionesWU < maxWU && dias.length < filasQuedan) {
    const r = await fetch(
      `https://api.weather.com/v2/pws/history/daily?stationId=${encodeURIComponent(imp.codigo)}&date=${dia.replaceAll("-", "")}&format=json&units=m&numericPrecision=decimal&apiKey=${encodeURIComponent(CLAVE_WU)}`,
    );
    peticionesWU++;
    if (r.status === 429) {
      await espera(61_000);
      continue;
    }
    if (r.status !== 204 && !r.ok) throw new Error(`Weather Underground HTTP ${r.status}`);
    const d = r.status === 204 ? null : diaWU(dia, ((await r.json()) ?? {}).observations?.[0]);
    if (d) dias.push(d);
    vacios = d ? 0 : vacios + 1;
    dia = vacios >= 60 || dia <= "2000-01-01" ? null : sumarDias(dia, -1);
    process.stdout.write(`\r  ${imp.slug}: va por ${dia ?? "—"} · ${dias.length} días   `);
    await espera(2100); // 30 por minuto como mucho
  }
  return { dias, cursor: dia, vacios, origen: "wu" };
}

let filasQuedan = maxFilas;
const pendientes = d1(
  `SELECT i.estacion_id, i.red, i.codigo, i.cursor, i.vacios, i.dias, e.slug, e.altitud FROM importaciones i JOIN estaciones e ON e.id = i.estacion_id
   WHERE i.cursor IS NOT NULL AND i.red IN ('aemet', 'wunderground') ORDER BY i.red, e.slug`,
).filter((i) => (!solo || i.slug === solo) && (!soloRed || i.red === soloRed));
console.log(`${pendientes.length} importaciones pendientes (${remoto ? "producción" : "local"})`);
mkdirSync("datos/tmp", { recursive: true });

for (const imp of pendientes) {
  if (filasQuedan <= 0) break;
  if (imp.red === "aemet" && !CLAVE_AEMET) continue;
  if (imp.red === "wunderground" && (!CLAVE_WU || peticionesWU >= maxWU)) continue;
  console.log(`${imp.slug} (${imp.red} ${imp.codigo}), desde el ${imp.cursor} hacia atrás`);
  let r;
  try {
    r = imp.red === "aemet" ? await historicoAemet(imp) : await historicoWU(imp);
  } catch (e) {
    console.log(`\n  se para: ${e.message}`);
    continue;
  }
  // Los días y, en la misma transacción, dónde queda la importación (NULL = terminada: la cola ya no la toca)
  const sql = [
    ...r.dias.map((d) => sentencia(valoresDia(imp.estacion_id, d, r.origen))),
    `UPDATE importaciones SET cursor = ${literal(r.cursor)}, vacios = ${r.vacios}, dias = dias + ${r.dias.length}, fallos = 0, error = NULL, turno = unixepoch() WHERE estacion_id = ${imp.estacion_id};`,
  ].join("\n");
  const fichero = `datos/tmp/historico-${imp.slug}.sql`;
  writeFileSync(fichero, sql);
  d1(fichero, true);
  filasQuedan -= r.dias.length;
  const desde = r.dias.length ? r.dias.reduce((m, d) => (d.fecha < m ? d.fecha : m), r.dias[0].fecha) : "—";
  console.log(`\n  ${r.dias.length} días guardados, desde el ${desde}${r.cursor ? ` (queda desde el ${r.cursor}: lo sigue la cola o otra ejecución)` : " · completo"}`);
}
console.log(filasQuedan <= 0 ? "Tope de filas de hoy alcanzado: vuelve a ejecutarlo mañana (o lo sigue la cola)." : "Hecho.");
