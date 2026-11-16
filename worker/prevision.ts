// Previsión de Open-Meteo (https://open-meteo.com, CC BY 4.0), cacheada 30 minutos.
import type { PrevisionDia, PrevisionHora, RespuestaPrevision } from "../shared/tipos";

const HORARIAS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "precipitation_probability",
  "weather_code",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "is_day",
];
const DIARIAS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "wind_direction_10m_dominant",
  "sunrise",
  "sunset",
];

export function urlOpenMeteo(lat: number, lon: number, altitud: number): string {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    elevation: String(altitud),
    hourly: HORARIAS.join(","),
    daily: DIARIAS.join(","),
    timezone: "Europe/Madrid",
    timeformat: "unixtime",
    forecast_days: "14",
    wind_speed_unit: "kmh",
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

const r1 = (v: number | null | undefined) => (v === null || v === undefined ? 0 : Math.round(v * 10) / 10);

/** Convierte la respuesta de Open-Meteo al formato compacto de la web. */
export function adaptarOpenMeteo(j: any, ahora: number): RespuestaPrevision {
  const h = j.hourly;
  const horas: PrevisionHora[] = [];
  for (let i = 0; i < h.time.length; i++) {
    // Desde la hora en curso hasta 48 h después
    if (h.time[i] <= ahora - 3600 || h.time[i] > ahora + 48 * 3600) continue;
    if (h.temperature_2m[i] === null) continue;
    horas.push({
      t: h.time[i],
      temp: r1(h.temperature_2m[i]),
      hum: Math.round(h.relative_humidity_2m[i] ?? 0),
      lluvia: r1(h.precipitation[i]),
      prob: Math.round(h.precipitation_probability[i] ?? 0),
      codigo: h.weather_code[i] ?? 0,
      viento: Math.round(h.wind_speed_10m[i] ?? 0),
      racha: Math.round(h.wind_gusts_10m[i] ?? 0),
      dir: Math.round(h.wind_direction_10m[i] ?? 0),
      dia: h.is_day[i] === 1,
    });
  }
  const d = j.daily;
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" });
  const dias: PrevisionDia[] = [];
  for (let i = 0; i < d.time.length; i++) {
    if (d.temperature_2m_max[i] === null) continue;
    dias.push({
      fecha: fecha.format(d.time[i] * 1000),
      codigo: d.weather_code[i] ?? 0,
      tmax: r1(d.temperature_2m_max[i]),
      tmin: r1(d.temperature_2m_min[i]),
      lluvia: r1(d.precipitation_sum[i]),
      prob: Math.round(d.precipitation_probability_max[i] ?? 0),
      viento: Math.round(d.wind_speed_10m_max[i] ?? 0),
      racha: Math.round(d.wind_gusts_10m_max[i] ?? 0),
      dir: Math.round(d.wind_direction_10m_dominant[i] ?? 0),
      salida: d.sunrise[i],
      puesta: d.sunset[i],
    });
  }
  return { generado: ahora, horas, dias };
}

/** Previsión de un punto (coordenadas redondeadas a ~1 km para aprovechar la caché). */
export async function obtenerPrevision(
  lugar: { lat: number; lon: number; altitud: number },
  ctx: { waitUntil(p: Promise<unknown>): void },
): Promise<RespuestaPrevision> {
  const r = (v: number) => Math.round(v * 100) / 100;
  const url = urlOpenMeteo(r(lugar.lat), r(lugar.lon), Math.round(lugar.altitud));
  const cache = caches.default;
  const clave = new Request(url);
  const guardada = await cache.match(clave);
  let j: any;
  if (guardada) {
    j = await guardada.json();
  } else {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
    j = await r.json();
    ctx.waitUntil(
      cache.put(clave, new Response(JSON.stringify(j), { headers: { "Cache-Control": "public, max-age=1800" } })),
    );
  }
  return adaptarOpenMeteo(j, Math.floor(Date.now() / 1000));
}
