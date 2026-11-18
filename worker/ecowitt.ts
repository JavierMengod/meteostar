// Lectura de datos de Ecowitt: envío directo de la consola (protocolo "Ecowitt",
// servidor personalizado) y API v3 de ecowitt.net como reserva.
import type { Lectura } from "../shared/tipos";
import { fAC, inHgAHpa, mphAKmh, pulgAMm, puntoRocio, redondear, sensacionTermica } from "../shared/meteo";

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const conv = (v: number | null, f: (x: number) => number) => (v === null ? null : f(v));

const alMinuto = (ts: number) => Math.floor(ts / 60) * 60;

/** Completa rocío y sensación si faltan y redondea todos los valores. */
function completar(l: Lectura): Lectura {
  const rocio = l.rocio ?? puntoRocio(l.temp, l.hum);
  const sensacion = l.sensacion ?? sensacionTermica(l.temp, l.hum, l.viento);
  return {
    ...l,
    temp: redondear(l.temp),
    hum: redondear(l.hum, 0),
    rocio: redondear(rocio),
    sensacion: redondear(sensacion),
    presion: redondear(l.presion),
    presion_abs: redondear(l.presion_abs),
    viento: redondear(l.viento),
    racha: redondear(l.racha),
    dir: redondear(l.dir, 0),
    lluvia_dia: redondear(l.lluvia_dia),
    intensidad: redondear(l.intensidad),
    radiacion: redondear(l.radiacion),
    uv: redondear(l.uv, 0),
    temp_int: redondear(l.temp_int),
    hum_int: redondear(l.hum_int, 0),
  };
}

/**
 * Convierte lo que envía la consola (unidades imperiales) en una lectura. Sirve para el protocolo
 * Ecowitt (formulario POST) y para el de Weather Underground (parámetros GET).
 * Campos habituales: tempf, humidity, baromrelin, baromabsin, windspeedmph,
 * windgustmph, winddir, dailyrainin, rainratein, solarradiation, uv, tempinf, humidityin, dateutc.
 */
export function leerEnvioConsola(f: Record<string, unknown>, ahora: number): Lectura {
  // dateutc llega como "2026-11-15 10:23:00" (UTC). Si no es válida o está muy desfasada, usamos la hora del servidor.
  let ts = ahora;
  if (typeof f.dateutc === "string") {
    // Ecowitt: "2026-11-15 10:23:00"; Weather Underground: "now" o "2026-11-15+10:23:00"
    const d = Date.parse(f.dateutc.replace(/[ +]/, "T") + "Z");
    if (Number.isFinite(d) && Math.abs(d / 1000 - ahora) < 600) ts = d / 1000;
  }
  return completar({
    ts: alMinuto(ts),
    fuente: "directo",
    temp: conv(num(f.tempf), fAC),
    hum: num(f.humidity),
    rocio: null,
    sensacion: null,
    // Protocolo Ecowitt (baromrelin) o Weather Underground (baromin)
    presion: conv(num(f.baromrelin ?? f.baromin), inHgAHpa),
    presion_abs: conv(num(f.baromabsin), inHgAHpa),
    viento: conv(num(f.windspeedmph), mphAKmh),
    racha: conv(num(f.windgustmph), mphAKmh),
    dir: num(f.winddir),
    lluvia_dia: conv(num(f.dailyrainin), pulgAMm),
    intensidad: conv(num(f.rainratein), pulgAMm),
    radiacion: num(f.solarradiation),
    uv: num(f.uv ?? f.UV),
    temp_int: conv(num(f.tempinf ?? f.indoortempf), fAC),
    hum_int: num(f.humidityin ?? f.indoorhumidity),
    // Sensor de rayos WH57: lightning_num (rayos hoy), lightning (km del último), lightning_time (su hora)
    rayos: num(f.lightning_num),
    rayos_dist: num(f.lightning),
    rayos_ts: num(f.lightning_time),
  });
}

/** Parámetros de unidades de la API v3: °C, hPa, km/h, mm y W/m². */
export const UNIDADES_API = {
  temp_unitid: "1",
  pressure_unitid: "3",
  wind_speed_unitid: "7",
  rainfall_unitid: "12",
  solar_irradiance_unitid: "16",
};

export function urlApiEcowitt(appKey: string, apiKey: string, mac: string): string {
  const p = new URLSearchParams({
    application_key: appKey,
    api_key: apiKey,
    mac,
    call_back: "all",
    ...UNIDADES_API,
  });
  return `https://api.ecowitt.net/api/v3/device/real_time?${p}`;
}

type Valor = { time?: string; value?: string } | undefined;
const v = (x: Valor) => num(x?.value);

/** Convierte la respuesta de /api/v3/device/real_time (ya en métrico) en una lectura. */
export function leerRespuestaApi(json: any, ahora: number): Lectura | null {
  if (!json || json.code !== 0 || !json.data) return null;
  const d = json.data;
  const tsDato = num(d.outdoor?.temperature?.time) ?? num(json.time) ?? ahora;
  // La lluvia puede venir como "rainfall" (pluviómetro clásico, el del WS69) o "rainfall_piezo"
  const lluvia = d.rainfall ?? d.rainfall_piezo ?? {};
  return completar({
    ts: alMinuto(Math.min(tsDato, ahora)),
    fuente: "ecowitt_api",
    temp: v(d.outdoor?.temperature),
    hum: v(d.outdoor?.humidity),
    rocio: v(d.outdoor?.dew_point),
    sensacion: null,
    presion: v(d.pressure?.relative),
    presion_abs: v(d.pressure?.absolute),
    viento: v(d.wind?.wind_speed),
    racha: v(d.wind?.wind_gust),
    dir: v(d.wind?.wind_direction),
    lluvia_dia: v(lluvia.daily),
    intensidad: v(lluvia.rain_rate),
    radiacion: v(d.solar_and_uvi?.solar),
    uv: v(d.solar_and_uvi?.uvi),
    temp_int: v(d.indoor?.temperature),
    hum_int: v(d.indoor?.humidity),
    // Sensor de rayos: la distancia viene en millas salvo que se pida otra unidad
    rayos: v(d.lightning?.count),
    rayos_dist: rayosKm(d.lightning?.distance),
    rayos_ts: num(d.lightning?.distance?.time),
  });
}

/** Distancia del último rayo en km (ecowitt.net la da en millas por defecto). */
function rayosKm(x: { unit?: string; value?: string } | undefined): number | null {
  const d = num(x?.value);
  if (d === null) return null;
  return x?.unit === "mi" ? Math.round(d * 1.609344 * 10) / 10 : d;
}
