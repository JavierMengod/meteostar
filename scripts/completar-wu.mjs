// Completa con Weather Underground los días de una estación que vienen de una hoja de cálculo (origen = 'hoja'),
// que solo tienen los extremos del día. De Weather Underground se piden las lecturas de cada día («history/all»,
// una cada 5 minutos) y se sacan las horas de los extremos, la humedad, la presión, la radiación, el UV…
//
// Uso: node scripts/completar-wu.mjs <slug> <estación WU> <desde> <hasta> [--completo] >> datos/wu-<slug>.sql
//   --completo: la estación de Weather Underground es la misma que la de la hoja: se usan todos sus datos (con hora),
//               salvo la lluvia, que se queda la de la hoja.
//   sin él: es otra estación (p. ej. la anterior): solo se añade lo que le falta a la hoja (humedad, presión,
//           radiación, UV…) y la hora de la máxima, la mínima y la racha si coinciden con los valores de la hoja.
// Solo toca días con origen = 'hoja' (nunca los de la propia estación). La clave: WU_API_KEY (o la de .dev.vars).
// Después: npx wrangler d1 execute meteostar --file datos/wu-<slug>.sql [--local | --remote]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const [slug, wu, desde, hasta] = args;
const completo = args.includes("--completo");
const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f ?? "");
if (!/^[a-z0-9-]+$/.test(slug ?? "") || !/^[A-Z0-9]+$/.test(wu ?? "") || !fechaOk(desde) || !fechaOk(hasta)) {
  console.error("Uso: node scripts/completar-wu.mjs <slug> <estación WU> <desde> <hasta> [--completo]");
  process.exit(1);
}
const clave =
  process.env.WU_API_KEY ||
  (readFileSync(".dev.vars", "utf8").match(/^WU_API_KEY=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "");
if (!clave) {
  console.error("Falta WU_API_KEY");
  process.exit(1);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const sumarDia = (f) => new Date(Date.parse(`${f}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const v = (x) => (x === null || x === undefined || !Number.isFinite(x) ? "NULL" : String(Math.round(x * 100) / 100));

/** El extremo (máximo o mínimo) de un campo, con el instante en que se dio. */
function extremo(obs, leer, max, valido = () => true) {
  let mejor = null;
  for (const o of obs) {
    const x = leer(o);
    if (x === null || x === undefined || !Number.isFinite(x) || !valido(x)) continue;
    if (!mejor || (max ? x > mejor.v : x < mejor.v)) mejor = { v: x, ts: o.epoch };
  }
  return mejor;
}
function media(obs, leer) {
  const l = obs.map(leer).filter((x) => x !== null && x !== undefined && Number.isFinite(x));
  return l.length ? { suma: l.reduce((a, b) => a + b, 0), n: l.length } : null;
}

const presionValida = (p) => p >= 950 && p <= 1060; // las que dan la presión sin corregir (≈ 900 hPa) no valen
const estacion = `(SELECT id FROM estaciones WHERE slug = '${slug}')`;

console.log(`-- ${completo ? "Días completados" : "Datos que faltaban"} de «${slug}» con Weather Underground (${wu}), del ${desde} al ${hasta}. scripts/completar-wu.mjs`);
let hechos = 0;
let sinDatos = 0;
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
  if (obs.length < 12) {
    sinDatos++;
    console.error(`${f}: sin datos en Weather Underground`);
    continue;
  }
  const m = (o) => o.metric ?? {};
  const tmax = extremo(obs, (o) => m(o).tempHigh, true);
  const tmin = extremo(obs, (o) => m(o).tempLow, false);
  const racha = extremo(obs, (o) => m(o).windgustHigh, true);
  const intensidad = extremo(obs, (o) => m(o).precipRate, true, (x) => x <= 300);
  const humMax = extremo(obs, (o) => o.humidityHigh, true);
  const humMin = extremo(obs, (o) => o.humidityLow, false);
  const presMax = extremo(obs, (o) => m(o).pressureMax, true, presionValida);
  const presMin = extremo(obs, (o) => m(o).pressureMin, false, presionValida);
  const vientoMax = extremo(obs, (o) => m(o).windspeedAvg, true);
  const radiacion = extremo(obs, (o) => o.solarRadiationHigh, true);
  const uv = extremo(obs, (o) => o.uvHigh, true);
  const tMedia = media(obs, (o) => m(o).tempAvg);
  const vMedia = media(obs, (o) => m(o).windspeedAvg);
  // Día incompleto (la estación dejó de enviar un rato): sus extremos no valen como los del día
  const diaCompleto = obs.length >= 200;
  const donde = `WHERE estacion_id = ${estacion} AND fecha = '${f}' AND origen = 'hoja'`;
  if (completo && diaCompleto) {
    console.log(
      `UPDATE resumen_diario SET tmax = ${v(tmax?.v)}, tmax_ts = ${v(tmax?.ts)}, tmin = ${v(tmin?.v)}, tmin_ts = ${v(tmin?.ts)}, ` +
        `hum_max = ${v(humMax?.v)}, hum_min = ${v(humMin?.v)}, presion_max = ${v(presMax?.v)}, presion_min = ${v(presMin?.v)}, ` +
        `viento_max = ${v(vientoMax?.v)}, racha_max = ${v(racha?.v)}, racha_max_ts = ${v(racha?.ts)}, ` +
        `intensidad_max = ${v(intensidad?.v)}, intensidad_max_ts = ${v(intensidad && intensidad.v > 0 ? intensidad.ts : null)}, ` +
        `radiacion_max = ${v(radiacion?.v)}, uv_max = ${v(uv?.v)}, ` +
        `temp_suma = ${v(tMedia?.suma)}, temp_n = ${tMedia?.n ?? 0}, viento_suma = ${v(vMedia?.suma)}, viento_n = ${vMedia?.n ?? 0}, ` +
        `lecturas = ${obs.length}, origen = 'wu' ${donde};`,
    );
  } else {
    // Solo lo que falta; las horas de la máxima, la mínima y la racha, si el valor coincide con el de la hoja
    const hora = (col, x) => (x ? `${col}_ts = CASE WHEN abs(${col} - ${v(x.v)}) <= 0.2 THEN ${v(x.ts)} ELSE ${col}_ts END` : `${col}_ts = ${col}_ts`);
    console.log(
      `UPDATE resumen_diario SET hum_max = ${v(humMax?.v)}, hum_min = ${v(humMin?.v)}, presion_max = ${v(presMax?.v)}, presion_min = ${v(presMin?.v)}, ` +
        `radiacion_max = ${v(radiacion?.v)}, uv_max = ${v(uv?.v)}, ` +
        `intensidad_max = ${v(intensidad?.v)}, intensidad_max_ts = ${v(intensidad && intensidad.v > 0 ? intensidad.ts : null)}, ` +
        `${hora("tmax", tmax)}, ${hora("tmin", tmin)}, ${hora("racha_max", racha)}, origen = 'hoja+wu' ${donde};`,
    );
  }
  hechos++;
  if (hechos % 20 === 0) console.error(`… ${f} (${hechos} días)`);
}
console.error(`${hechos} días completados, ${sinDatos} sin datos en Weather Underground`);
