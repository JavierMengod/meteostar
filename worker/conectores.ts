// Conectores: de dónde salen los datos de cada estación.
// Para añadir una fuente nueva basta con añadir un conector a CONECTORES.
import type { InfoConector, Lectura } from "../shared/tipos";
import { puntoRocio, redondear, sensacionTermica } from "../shared/meteo";
import { presionMar } from "./aemet";
import { leerRespuestaApi, urlApiEcowitt } from "./ecowitt";
import { fechaLocal } from "./fechas";
import { bloqueEstacion, feedProvincia, leerRssEstacion, regionDe, rssEstacion } from "./meteoclimatic";
import { observacionWU } from "./wunderground";

/** Extremos del día que da la propia fuente (por si las lecturas no los recogen todos). */
export interface ExtremosDia {
  tmax?: number | null;
  tmin?: number | null;
  hum_max?: number | null;
  hum_min?: number | null;
  presion_max?: number | null;
  presion_min?: number | null;
  racha_max?: number | null;
}

export interface ResultadoLectura {
  lecturas: Lectura[];
  extremos?: ExtremosDia;
}

export interface Conector extends InfoConector {
  /** Lee la estación (solo los conectores de consulta, o el directo si tiene reserva). */
  leer?: (config: Record<string, string>, env: Env, ahora: number) => Promise<ResultadoLectura>;
}

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const alMinuto = (ts: number) => Math.floor(ts / 60) * 60;

/** Completa rocío y sensación y redondea. */
export function lecturaCompleta(base: Partial<Lectura> & { ts: number; fuente: string }): Lectura {
  const l: Lectura = {
    temp: null, hum: null, rocio: null, sensacion: null, presion: null, presion_abs: null,
    viento: null, racha: null, dir: null, lluvia_dia: null, intensidad: null,
    radiacion: null, uv: null, temp_int: null, hum_int: null,
    ...base,
    ts: alMinuto(base.ts),
  };
  const r = (v: number | null, d = 1) => redondear(v, d);
  return {
    ...l,
    temp: r(l.temp), hum: r(l.hum, 0), rocio: r(l.rocio ?? puntoRocio(l.temp, l.hum)),
    sensacion: r(l.sensacion ?? sensacionTermica(l.temp, l.hum, l.viento)),
    presion: r(l.presion), presion_abs: r(l.presion_abs), viento: r(l.viento), racha: r(l.racha),
    dir: r(l.dir, 0), lluvia_dia: r(l.lluvia_dia), intensidad: r(l.intensidad), radiacion: r(l.radiacion),
    uv: r(l.uv, 0), temp_int: r(l.temp_int), hum_int: r(l.hum_int, 0),
  };
}

async function pedirJson(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${new URL(url).host}`);
  return r.json();
}

// ----- ecowitt.net -----

async function leerEcowitt(config: Record<string, string>, ahora: number): Promise<ResultadoLectura> {
  if (!config.application_key || !config.api_key || !config.mac) throw new Error("Faltan las claves de ecowitt.net (Application Key, API Key y MAC)");
  const j = await pedirJson(urlApiEcowitt(config.application_key, config.api_key, config.mac));
  const l = leerRespuestaApi(j, ahora);
  if (!l) throw new Error(`ecowitt.net: ${j?.msg ?? "respuesta no válida"}`);
  return { lecturas: [l] };
}

// ----- Weather Underground -----

/** Convierte la respuesta de /v2/pws/observations/current (unidades métricas). */
export function leerWunderground(j: any): Lectura | null {
  const o = j?.observations?.[0];
  if (!o) return null;
  const m = o.metric ?? {};
  return lecturaCompleta({
    ts: num(o.epoch) ?? Date.parse(o.obsTimeUtc) / 1000,
    fuente: "wunderground",
    temp: num(m.temp),
    hum: num(o.humidity),
    rocio: num(m.dewpt),
    presion: num(m.pressure),
    viento: num(m.windSpeed),
    racha: num(m.windGust),
    dir: num(o.winddir),
    lluvia_dia: num(m.precipTotal),
    intensidad: num(m.precipRate),
    radiacion: num(o.solarRadiation),
    uv: num(o.uv),
  });
}

async function leerWU(config: Record<string, string>, env: Env): Promise<ResultadoLectura> {
  let j: any;
  if (config.api_key) {
    // Estación de un usuario, con su propia clave
    const p = new URLSearchParams({ stationId: config.estacion, format: "json", units: "m", numericPrecision: "decimal", apiKey: config.api_key });
    j = await pedirJson(`https://api.weather.com/v2/pws/observations/current?${p}`);
  } else {
    // Estación de otra red dada de alta desde el mapa: la clave general de la web, con su cupo diario
    j = await observacionWU(env, config.estacion);
  }
  const l = leerWunderground(j);
  if (!l) throw new Error("Weather Underground: la estación no devuelve datos");
  return { lecturas: [l] };
}

// ----- Meteoclimatic -----

/** Lee el XML público de Meteoclimatic: el de una estación o, con «codigo», el de su provincia (trae todas). */
export function leerMeteoclimatic(xmlEntero: string, codigo?: string): ResultadoLectura {
  const xml = codigo ? (bloqueEstacion(xmlEntero, codigo) ?? "") : xmlEntero;
  const bloque = (nombre: string) => xml.match(new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`))?.[1] ?? "";
  const valor = (texto: string, etiqueta: string) => num(texto.match(new RegExp(`<${etiqueta}>([^<]*)</${etiqueta}>`))?.[1]);
  const estacion = bloque("station");
  if (!estacion) throw new Error("Meteoclimatic: estación no encontrada");
  const fecha = Date.parse(estacion.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] ?? "");
  const t = bloque("temperature"), h = bloque("humidity"), p = bloque("barometre"), v = bloque("wind"), ll = bloque("rain");
  return {
    lecturas: [
      lecturaCompleta({
        ts: Number.isNaN(fecha) ? Date.now() / 1000 : fecha / 1000,
        fuente: "meteoclimatic",
        temp: valor(t, "now"),
        hum: valor(h, "now"),
        presion: valor(p, "now"),
        viento: valor(v, "now"),
        dir: valor(v, "azimuth"),
        lluvia_dia: valor(ll, "total"),
      }),
    ],
    extremos: {
      tmax: valor(t, "max"),
      tmin: valor(t, "min"),
      hum_max: valor(h, "max"),
      hum_min: valor(h, "min"),
      presion_max: valor(p, "max"),
      presion_min: valor(p, "min"),
      racha_max: valor(v, "max"),
    },
  };
}

/** Texto en ISO-8859-15 (Meteoclimatic, AEMET) a cadena: los datos que usamos son ASCII. */
async function textoLatin(r: Response): Promise<string> {
  const bytes = new Uint8Array(await r.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
}

async function leerMC(config: Record<string, string>): Promise<ResultadoLectura> {
  const codigo = config.codigo.trim().toUpperCase();
  if (!/^[A-Z0-9]{10,25}$/.test(codigo)) throw new Error("Código de Meteoclimatic no válido");
  // El feed de la provincia: una petición para todas sus estaciones, en caché unos minutos
  const provincia = await feedProvincia(regionDe(codigo));
  if (bloqueEstacion(provincia, codigo)) return leerMeteoclimatic(provincia, codigo);
  // No sale en el de la provincia (solo trae las que han enviado hace poco): su propio RSS
  const v = leerRssEstacion(await rssEstacion(codigo));
  if (!v || v.t === null) throw new Error("Meteoclimatic: la estación no tiene datos ahora mismo");
  return {
    lecturas: [
      lecturaCompleta({ ts: v.t, fuente: "meteoclimatic", temp: v.temp, hum: v.hum, presion: v.presion, viento: v.viento, dir: v.dir, lluvia_dia: v.lluvia }),
    ],
    extremos: { tmax: v.tmax, tmin: v.tmin, hum_max: v.hum_max, hum_min: v.hum_min, presion_max: v.presion_max, presion_min: v.presion_min, racha_max: v.racha_max },
  };
}

// ----- AEMET OpenData (estaciones oficiales) -----

/**
 * Convierte las observaciones horarias de AEMET (últimas 24 h) en lecturas.
 * La lluvia del día se acumula sumando la precipitación horaria desde medianoche (hora local).
 */
export function leerObservacionesAemet(obs: any[]): Lectura[] {
  const ordenadas = [...obs]
    .map((o) => ({ o, ts: Date.parse(String(o.fint).replace(/\+0000$/, "Z")) / 1000 }))
    .filter((x) => !Number.isNaN(x.ts))
    .sort((a, b) => a.ts - b.ts);
  const acumulado = new Map<string, number>();
  return ordenadas.map(({ o, ts }) => {
    const dia = fechaLocal(ts - 1); // la lluvia de las 00:00 es de la hora anterior
    const prec = num(o.prec);
    if (prec !== null) acumulado.set(dia, (acumulado.get(dia) ?? 0) + prec);
    const ms = (v: unknown) => (num(v) === null ? null : num(v)! * 3.6); // m/s → km/h
    return lecturaCompleta({
      ts,
      fuente: "aemet",
      temp: num(o.ta),
      hum: num(o.hr),
      rocio: num(o.tpr),
      // Muchas estaciones no dan la presión reducida al nivel del mar: se calcula con la de la estación y su altitud
      presion: num(o.pres_nmar) ?? presionMar(num(o.pres), num(o.alt), num(o.ta)),
      presion_abs: num(o.pres),
      viento: ms(o.vv),
      racha: ms(o.vmax),
      dir: num(o.dv),
      lluvia_dia: fechaLocal(ts - 1) === fechaLocal(ts) ? (acumulado.get(dia) ?? null) : 0,
      intensidad: prec,
    });
  });
}

async function leerAemet(config: Record<string, string>, env: Env): Promise<ResultadoLectura> {
  const clave = config.api_key || env.AEMET_API_KEY;
  if (!clave) throw new Error("Falta la clave de AEMET OpenData");
  const idema = config.idema.trim().toUpperCase();
  const paso1 = await pedirJson(`https://opendata.aemet.es/opendata/api/observacion/convencional/datos/estacion/${encodeURIComponent(idema)}`, {
    headers: { api_key: clave },
  });
  if (paso1.estado !== 200 || !paso1.datos) throw new Error(`AEMET: ${paso1.descripcion ?? "sin datos"}`);
  const r = await fetch(paso1.datos, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`AEMET HTTP ${r.status}`);
  const obs = JSON.parse(await textoLatin(r));
  return { lecturas: leerObservacionesAemet(Array.isArray(obs) ? obs : []) };
}

// ----- Registro -----

const CAMPOS_ECOWITT = [
  { nombre: "application_key", etiqueta: "Application Key", tipo: "secreto" as const, obligatorio: true, ayuda: "En ecowitt.net → Perfil → API Keys" },
  { nombre: "api_key", etiqueta: "API Key", tipo: "secreto" as const, obligatorio: true },
  { nombre: "mac", etiqueta: "MAC de la consola", tipo: "texto" as const, obligatorio: true, ejemplo: "AA:BB:CC:DD:EE:FF" },
];

export const CONECTORES: Conector[] = [
  {
    id: "directo",
    nombre: "Envío directo",
    descripcion:
      "La consola envía sus datos a Meteostar cada minuto (protocolo Ecowitt o Weather Underground, en «servidor personalizado»). Es la opción más precisa. Opcionalmente, si la consola deja de enviar, se leen los datos de ecowitt.net como reserva.",
    modo: "envio",
    intervalo: 1,
    campos: CAMPOS_ECOWITT.map((c) => ({ ...c, obligatorio: false, ayuda: c.ayuda && `Reserva opcional. ${c.ayuda}` })),
    soloAdmin: false,
    leer: (config, _env, ahora) => leerEcowitt(config, ahora),
  },
  {
    id: "ecowitt_api",
    nombre: "ecowitt.net",
    descripcion: "Meteostar lee la estación de tu cuenta de ecowitt.net cada minuto.",
    modo: "consulta",
    intervalo: 1,
    campos: CAMPOS_ECOWITT,
    soloAdmin: false,
    leer: (config, _env, ahora) => leerEcowitt(config, ahora),
  },
  {
    id: "wunderground",
    nombre: "Weather Underground",
    descripcion: "Meteostar lee una estación personal de Weather Underground cada 10 minutos.",
    modo: "consulta",
    intervalo: 10,
    campos: [
      { nombre: "estacion", etiqueta: "ID de la estación", tipo: "texto", obligatorio: true, ejemplo: "ITERUE12" },
      { nombre: "api_key", etiqueta: "Clave de API", tipo: "secreto", obligatorio: true, ayuda: "En wunderground.com → Mi perfil → Claves API" },
    ],
    soloAdmin: false,
    leer: (config, env) => leerWU(config, env),
  },
  {
    id: "meteoclimatic",
    nombre: "Meteoclimatic",
    descripcion: "Meteostar lee los datos públicos de una estación de la red Meteoclimatic cada 10 minutos (licencia CC BY-NC-ND).",
    modo: "consulta",
    intervalo: 10,
    campos: [{ nombre: "codigo", etiqueta: "Código de la estación", tipo: "texto", obligatorio: true, ejemplo: "ESARA4400000044XXXA" }],
    soloAdmin: false,
    leer: (config) => leerMC(config),
  },
  {
    id: "aemet",
    nombre: "AEMET (oficial)",
    descripcion: "Observaciones horarias de una estación de AEMET: cada dato se recoge en cuanto AEMET lo publica (unos 40 minutos después de la hora).",
    modo: "consulta",
    // Se mira cada 10 minutos, pero solo cuando ya toca dato nuevo (ver «toca» en cron.ts)
    intervalo: 10,
    campos: [
      { nombre: "idema", etiqueta: "Indicativo de la estación", tipo: "texto", obligatorio: true, ejemplo: "8368U (Teruel)" },
      { nombre: "api_key", etiqueta: "Clave de AEMET OpenData", tipo: "secreto", obligatorio: false, ayuda: "Si se deja vacía, se usa la clave general de la web" },
    ],
    soloAdmin: true,
    leer: (config, env) => leerAemet(config, env),
  },
];

export const conector = (id: string) => CONECTORES.find((c) => c.id === id);

/** Información pública de los conectores (sin funciones). */
export const infoConectores = (): InfoConector[] => CONECTORES.map(({ leer: _leer, ...info }) => info);
