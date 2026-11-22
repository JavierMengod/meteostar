// Corrige con Weather Underground (una observación cada 5 minutos) las máximas y mínimas de días importados de
// ecowitt.net con datos cada 30 minutos (lo que ecowitt.net guarda de hace más de 3 meses): con un dato cada 30 minutos
// la máxima y la mínima de verdad pueden caer entre dos datos, así que salen más suaves.
//
// Regla: solo se cambia un extremo si el de Weather Underground es MÁS extremo (máxima más alta, mínima más baja; lo
// mismo con la humedad). Con menos datos el extremo solo puede quedarse corto, nunca pasarse: un día bien no se toca.
// Con --dias-completos f1,f2… esos días (p. ej. el primero, incompleto) se rehacen además con la media del día completo.
//
// Uso: node scripts/corregir-extremos-wu.mjs <slug> <estación WU> <desde> <hasta> [--dias-completos aaaa-mm-dd,…] > datos/extremos-<slug>.sql
// Después: npx wrangler d1 execute meteostar --file datos/extremos-<slug>.sql [--local | --remote]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const [slug, wu, desde, hasta] = args;
const completos = new Set((args.includes("--dias-completos") ? args[args.indexOf("--dias-completos") + 1] : "").split(",").filter(Boolean));
const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f ?? "");
if (!/^[a-z0-9-]+$/.test(slug ?? "") || !/^[A-Z0-9]+$/.test(wu ?? "") || !fechaOk(desde) || !fechaOk(hasta)) {
  console.error("Uso: node scripts/corregir-extremos-wu.mjs <slug> <estación WU> <desde> <hasta> [--dias-completos aaaa-mm-dd,…]");
  process.exit(1);
}
const clave =
  process.env.WU_API_KEY || (readFileSync(".dev.vars", "utf8").match(/^WU_API_KEY=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "");
if (!clave) {
  console.error("Falta WU_API_KEY");
  process.exit(1);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const sumarDia = (f) => new Date(Date.parse(`${f}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const v = (x) => (x === null || x === undefined || !Number.isFinite(x) ? "NULL" : String(Math.round(x * 100) / 100));

/** El extremo (máximo o mínimo) de un campo, con el instante en que se dio. */
function extremo(obs, leer, max) {
  let mejor = null;
  for (const o of obs) {
    const x = leer(o);
    if (x === null || x === undefined || !Number.isFinite(x)) continue;
    if (!mejor || (max ? x > mejor.v : x < mejor.v)) mejor = { v: x, ts: o.epoch };
  }
  return mejor;
}

const estacion = `(SELECT id FROM estaciones WHERE slug = '${slug}')`;
console.log(`-- Máximas y mínimas de «${slug}» corregidas con Weather Underground (${wu}, cada 5 min), del ${desde} al ${hasta}. scripts/corregir-extremos-wu.mjs`);
let dias = 0;
for (let f = desde; f <= hasta; f = sumarDia(f)) {
  let obs = [];
  for (let intento = 0; intento < 4; intento++) {
    const r = await fetch(
      `https://api.weather.com/v2/pws/history/all?stationId=${wu}&date=${f.replaceAll("-", "")}&format=json&units=m&numericPrecision=decimal&apiKey=${clave}`,
    );
    if (r.status === 204) break;
    if (r.ok) {
      obs = (await r.json()).observations ?? [];
      break;
    }
    console.error(`${f}: HTTP ${r.status}, se reintenta`);
    await espera(r.status === 429 ? 60000 : 5000);
  }
  await espera(2100); // unas 28 peticiones por minuto
  // Solo días completos (con huecos, el extremo del día podría faltar)
  if (obs.length < 200) {
    console.error(`${f}: ${obs.length} observaciones en Weather Underground, no se toca`);
    continue;
  }
  const m = (o) => o.metric ?? {};
  const tmax = extremo(obs, (o) => m(o).tempHigh, true);
  const tmin = extremo(obs, (o) => m(o).tempLow, false);
  const humMax = extremo(obs, (o) => o.humidityHigh, true);
  const humMin = extremo(obs, (o) => o.humidityLow, false);
  const donde = `estacion_id = ${estacion} AND fecha = '${f}'`;
  if (tmax) console.log(`UPDATE resumen_diario SET tmax = ${v(tmax.v)}, tmax_ts = ${v(tmax.ts)} WHERE ${donde} AND (tmax IS NULL OR tmax < ${v(tmax.v)});`);
  if (tmin) console.log(`UPDATE resumen_diario SET tmin = ${v(tmin.v)}, tmin_ts = ${v(tmin.ts)} WHERE ${donde} AND (tmin IS NULL OR tmin > ${v(tmin.v)});`);
  if (humMax) console.log(`UPDATE resumen_diario SET hum_max = ${v(humMax.v)} WHERE ${donde} AND (hum_max IS NULL OR hum_max < ${v(humMax.v)});`);
  if (humMin) console.log(`UPDATE resumen_diario SET hum_min = ${v(humMin.v)} WHERE ${donde} AND (hum_min IS NULL OR hum_min > ${v(humMin.v)});`);
  if (completos.has(f)) {
    // Día incompleto en la estación: su media, la del día completo
    const t = obs.map((o) => m(o).tempAvg).filter((x) => Number.isFinite(x));
    const w = obs.map((o) => m(o).windspeedAvg).filter((x) => Number.isFinite(x));
    console.log(
      `UPDATE resumen_diario SET temp_suma = ${v(t.reduce((a, b) => a + b, 0))}, temp_n = ${t.length}, viento_suma = ${v(w.reduce((a, b) => a + b, 0))}, viento_n = ${w.length} WHERE ${donde};`,
    );
  }
  dias++;
}
console.error(`${dias} días revisados`);
