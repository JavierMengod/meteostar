// Importa el histórico de una estación desde ecowitt.net (consulta «history» de su API v3).
// ecowitt.net guarda datos cada 5 minutos de los últimos meses y cada 30 minutos de antes, desde que la estación se dio
// de alta allí. Se importa día a día (una petición por día): de cada día se guarda su resumen (máximas, mínimas con su
// hora, lluvia, racha…) y, de los últimos días que conserva Meteostar, también las lecturas.
import type { Lectura } from "../shared/tipos";
import { redondear } from "../shared/meteo";
import { descifrar } from "./cifrado";
import { DIAS_LECTURAS, fusionarResumenDia, guardarLecturasLote } from "./db";
import { UNIDADES_API } from "./ecowitt";
import type { FilaEstacion } from "./estaciones";
import { fechaLocal } from "./fechas";

const API = "https://api.ecowitt.net/api/v3/device";
/** Días por llamada (una petición a ecowitt.net por día) */
export const DIAS_POR_LLAMADA = 5;

const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

const num = (x: unknown) => {
  const n = Number(x);
  return x === undefined || x === null || x === "" || !Number.isFinite(n) ? null : n;
};

/** Claves de ecowitt.net de la estación (las del conector ecowitt.net o la reserva del envío directo). */
async function claves(env: Env, f: FilaEstacion) {
  if (f.fuente !== "ecowitt_api" && f.fuente !== "directo") throw new Error("Esta estación no lee de ecowitt.net");
  const c = await descifrar(env, f.config);
  if (!c.application_key || !c.api_key || !c.mac) throw new Error("Faltan las claves de ecowitt.net (Application Key, API Key y MAC)");
  return c as { application_key: string; api_key: string; mac: string };
}

async function pedir(ruta: string, params: Record<string, string>) {
  const r = await fetch(`${API}/${ruta}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(20_000) });
  const j: any = await r.json();
  if (j?.code !== 0) throw new Error(`ecowitt.net: ${j?.msg ?? `HTTP ${r.status}`}`);
  return j.data;
}

/** Día (aaaa-mm-dd) en que la estación se dio de alta en ecowitt.net. */
export async function primerDiaEcowitt(env: Env, f: FilaEstacion): Promise<string> {
  const c = await claves(env, f);
  const d = await pedir("info", { application_key: c.application_key, api_key: c.api_key, mac: c.mac });
  const creada = num(d?.createtime);
  if (!creada) throw new Error("ecowitt.net no dice desde cuándo tiene datos");
  // Un día antes, por si la hora de alta va en otra zona horaria (los días sin datos no guardan nada)
  return sumarDias(fechaLocal(creada), -1);
}

/**
 * Contadores del día (lluvia, rayos) puestos a cero a medianoche de Madrid. ecowitt.net los pone a cero a medianoche
 * de la zona horaria de la estación (p. ej. Londres: la 1:00 de Madrid), así que en la primera hora del día seguiría
 * contando la lluvia del anterior. Se suman las subidas de lectura a lectura (si baja, es que se puso a cero).
 */
export function contadorDesdeMedianoche(serie: Record<string, string>, instantes: number[]): Map<number, number> {
  const fuera = new Map<number, number>();
  let antes: number | null = null;
  let dia = "";
  let total = 0;
  for (const t of instantes) {
    const v = num(serie[String(t)]);
    if (v === null) continue;
    const subida = antes === null ? 0 : v >= antes ? v - antes : v;
    antes = v;
    const f = fechaLocal(t);
    if (f !== dia) {
      dia = f;
      total = 0;
    }
    total += subida;
    fuera.set(t, Math.round(total * 10) / 10);
  }
  return fuera;
}

/** Lecturas de un día (hora de Madrid) a partir de la respuesta de «history». */
export function lecturasHistorico(data: any, fecha: string): Lectura[] {
  const serie = (grupo: string, campo: string): Record<string, string> => data?.[grupo]?.[campo]?.list ?? {};
  const s = {
    temp: serie("outdoor", "temperature"),
    hum: serie("outdoor", "humidity"),
    rocio: serie("outdoor", "dew_point"),
    sensacion: serie("outdoor", "feels_like"),
    presion: serie("pressure", "relative"),
    presion_abs: serie("pressure", "absolute"),
    viento: serie("wind", "wind_speed"),
    racha: serie("wind", "wind_gust"),
    dir: serie("wind", "wind_direction"),
    lluvia_dia: serie("rainfall", "daily"),
    intensidad: serie("rainfall", "rain_rate"),
    radiacion: serie("solar_and_uvi", "solar"),
    uv: serie("solar_and_uvi", "uvi"),
    temp_int: serie("indoor", "temperature"),
    hum_int: serie("indoor", "humidity"),
    rayos: serie("lightning", "count"),
    rayos_dist: serie("lightning", "distance"),
  };
  const millas = data?.lightning?.distance?.unit === "mi";
  // Todos los instantes pedidos (también los de la víspera, para saber cuánto llevaban los contadores a medianoche)
  const todos = Object.keys(s.temp)
    .map(Number)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const lluvia = contadorDesdeMedianoche(s.lluvia_dia, todos);
  const rayos = contadorDesdeMedianoche(s.rayos, todos);
  const instantes = todos.filter((t) => fechaLocal(t) === fecha);
  return instantes.map((t) => {
    const g = (k: keyof typeof s) => num(s[k][String(t)]);
    return {
      ts: Math.floor(t / 60) * 60,
      fuente: "ecowitt_historico",
      temp: redondear(g("temp")),
      hum: redondear(g("hum"), 0),
      rocio: redondear(g("rocio")),
      sensacion: redondear(g("sensacion")),
      presion: redondear(g("presion")),
      presion_abs: redondear(g("presion_abs")),
      viento: redondear(g("viento")),
      racha: redondear(g("racha")),
      dir: g("dir"),
      lluvia_dia: lluvia.get(t) ?? null,
      intensidad: redondear(g("intensidad")),
      radiacion: redondear(g("radiacion"), 0),
      uv: redondear(g("uv")),
      temp_int: redondear(g("temp_int")),
      hum_int: redondear(g("hum_int"), 0),
      rayos: rayos.has(t) ? Math.round(rayos.get(t)!) : null,
      rayos_dist: g("rayos_dist") === null ? null : redondear(millas ? g("rayos_dist")! * 1.609344 : g("rayos_dist")),
    };
  });
}

/** Importa un día. Devuelve cuántas lecturas tenía. */
async function importarDia(env: Env, f: FilaEstacion, c: { application_key: string; api_key: string; mac: string }, fecha: string, ahora: number): Promise<number> {
  const diasAtras = (ahora - Date.parse(`${fecha}T12:00:00Z`) / 1000) / 86400;
  // Se pide con margen por los dos lados (ecowitt.net usa la zona horaria de la estación) y se filtra por el día de Madrid
  const data = await pedir("history", {
    application_key: c.application_key,
    api_key: c.api_key,
    mac: c.mac,
    cycle_type: diasAtras < 85 ? "5min" : "30min",
    start_date: `${sumarDias(fecha, -1)} 20:00:00`,
    end_date: `${sumarDias(fecha, 1)} 04:00:00`,
    call_back: "outdoor,indoor,wind,pressure,rainfall,solar_and_uvi,lightning",
    ...UNIDADES_API,
  });
  const lecturas = lecturasHistorico(data, fecha);
  await fusionarResumenDia(env.DB, f.id, fecha, lecturas);
  // Las lecturas solo se conservan unos días: las de antes ya no se guardan (se borrarían esta noche)
  if (diasAtras < DIAS_LECTURAS) await guardarLecturasLote(env.DB, f.id, lecturas, "ecowitt_historico");
  return lecturas.length;
}

/**
 * Importa hasta DIAS_POR_LLAMADA días a partir de «desde» (incluido) sin pasar de hoy. Devuelve el siguiente día
 * pendiente (o null si ya está todo), para que la página vaya llamando hasta acabar.
 */
export async function importarTramo(env: Env, f: FilaEstacion, desde: string, ahora: number) {
  const c = await claves(env, f);
  // Hasta hoy incluido (lo que lleva de día): así el resumen de hoy también tiene la mínima de la madrugada
  const ultimo = fechaLocal(ahora);
  const hechos: { fecha: string; lecturas: number }[] = [];
  let fecha = desde;
  while (fecha <= ultimo && hechos.length < DIAS_POR_LLAMADA) {
    hechos.push({ fecha, lecturas: await importarDia(env, f, c, fecha, ahora) });
    fecha = sumarDias(fecha, 1);
  }
  return { hechos, siguiente: fecha <= ultimo ? fecha : null, ultimo };
}
