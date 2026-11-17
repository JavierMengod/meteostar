// Aforos de río medidos: Observatorio del Agua GOTA del MITECO (https://observatorioagua.miteco.es/hidrologia/),
// que publica los datos de los SAIH de las confederaciones. Reutilización permitida citando la fuente
// (aviso legal del MITECO, Ley 37/2007). Son datos en tiempo real, provisionales y sin validar.
// Los aforos que se muestran se configuran en Administración (tabla «aforos»).
// El servicio da como mucho 7 días de una vez: cada 10 minutos se guardan las lecturas nuevas en D1.
import { diaHidrologico } from "../shared/hidrologia";
import type { Aforo, AforoCatalogo, AforoConfig, DetalleAforo, ResumenAforo } from "../shared/tipos";
import { resumenes } from "./db";
import { estacionesPublicas } from "./estaciones";
import { fechaLocal } from "./fechas";

const OBSERVATORIO = "https://observatorioagua.miteco.es";
const AGENTE = "Meteostar/1.0 (web meteorologica sin animo de lucro)";
const PRODUCTO = {
  caudal: "01928f80-65ec-75e6-bddc-6daa2b7c51f1",
  nivel: "01928f80-65ec-7479-95cb-288f07921f44",
};
/** Capa de aforos (nivel en río) del visor del Observatorio */
const CAPA_AFOROS =
  "/wms/wfs?service=WFS&version=1.0.0&request=GetFeature&typename=argos:sensors&viewparams=id_account:0199c90f-5fa2-7ccf-ad0c-eb4095729e29;id_product:01928f80-65ec-7479-95cb-288f07921f44;icon_type:river_level;icon_format:png;feature_type:product_sensors&outputFormat=application/json";

/** Demarcaciones hidrográficas por el código que usa el Observatorio (cod_demar) */
const DEMARCACIONES: Record<string, string> = {
  "11": "Miño-Sil",
  "14": "Galicia-Costa",
  "17": "Cantábrico Oriental",
  "18": "Cantábrico Occidental",
  "21": "Duero",
  "31": "Tajo",
  "40": "Guadiana",
  "51": "Guadalquivir",
  "71": "Segura",
  "81": "Júcar",
  "91": "Ebro",
  "JÚCAR": "Júcar",
};

/** Días que se muestran en la página de cada aforo */
const DIAS = 30;

type Ctx = { waitUntil(p: Promise<unknown>): void };
export type Lectura = [number, number | null, number | null];

export interface FilaAforo {
  slug: string;
  nombre: string;
  rio: string;
  codigo: string | null;
  elemento: string;
  confederacion: string | null;
  lat: number;
  lon: number;
  embalse: string | null;
  regulado_desde: number | null;
  umbrales: string | null;
  celda_lat: number | null;
  celda_lon: number | null;
  orden: number;
}

export async function aforosConfigurados(db: D1Database): Promise<FilaAforo[]> {
  return (await db.prepare("SELECT * FROM aforos ORDER BY orden, creado").all<FilaAforo>()).results;
}

export async function aforoPorSlug(db: D1Database, slug: string): Promise<FilaAforo | null> {
  return db.prepare("SELECT * FROM aforos WHERE slug = ?").bind(slug).first<FilaAforo>();
}

export const configDe = (f: FilaAforo): AforoConfig => ({
  slug: f.slug,
  nombre: f.nombre,
  rio: f.rio,
  codigo: f.codigo,
  confederacion: f.confederacion,
  lat: f.lat,
  lon: f.lon,
  embalse: f.embalse,
  reguladoDesde: f.regulado_desde,
});

export interface Serie {
  puntos: [number, number][];
  /** Umbrales de aviso de la confederación (m³/s), de menor a mayor */
  umbrales: number[];
}

/** Convierte la respuesta del Observatorio en pares [segundos, valor]. */
export function adaptarSerie(j: any): Serie {
  const fechas: unknown[] = Array.isArray(j?.dates) ? j.dates : [];
  const valores: unknown[] = Array.isArray(j?.values) ? j.values : [];
  const puntos: [number, number][] = [];
  fechas.forEach((f, i) => {
    const t = Date.parse(String(f)) / 1000;
    const v = valores[i];
    if (Number.isFinite(t) && typeof v === "number" && Number.isFinite(v)) puntos.push([t, v]);
  });
  const umbrales = (Array.isArray(j?.thresholds) ? j.thresholds : [])
    .map((u: any) => u?.value)
    .filter((v: unknown): v is number => typeof v === "number")
    .sort((a: number, b: number) => a - b);
  return { puntos, umbrales };
}

async function pedirObservatorio(ruta: string): Promise<any> {
  const r = await fetch(`${OBSERVATORIO}${ruta}`, { headers: { "User-Agent": AGENTE, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Observatorio del Agua HTTP ${r.status}`);
  return r.json();
}

async function pedirSerie(elemento: string, producto: string, horas: number): Promise<Serie> {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - horas * 3600_000);
  return adaptarSerie(
    await pedirObservatorio(`/api/Historical/chart/product/${producto}/element/${elemento}?from=${desde.toISOString()}&to=${hasta.toISOString()}`),
  );
}

/** Junta caudal y nivel por instante. */
export function juntar(caudal: [number, number][], nivel: [number, number][]): Lectura[] {
  const m = new Map<number, [number | null, number | null]>();
  for (const [t, v] of caudal) m.set(t, [v, m.get(t)?.[1] ?? null]);
  for (const [t, v] of nivel) m.set(t, [m.get(t)?.[0] ?? null, v]);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, [c, n]]) => [t, c, n]);
}

async function guardarLecturas(db: D1Database, slug: string, filas: Lectura[]) {
  const insertar = db.prepare(
    "INSERT INTO aforo_lecturas (estacion, t, caudal, nivel) VALUES (?, ?, ?, ?) ON CONFLICT (estacion, t) DO UPDATE SET caudal = excluded.caudal, nivel = excluded.nivel",
  );
  for (let i = 0; i < filas.length; i += 50) await db.batch(filas.slice(i, i + 50).map(([t, c, n]) => insertar.bind(slug, t, c, n)));
}

/** Lee las últimas horas de un aforo (7 días si aún no hay nada) y las guarda, con sus umbrales. */
async function leerAforo(db: D1Database, a: FilaAforo): Promise<Lectura[]> {
  const hay = await db.prepare("SELECT 1 FROM aforo_lecturas WHERE estacion = ? LIMIT 1").bind(a.slug).first();
  const horas = hay ? 6 : 7 * 24;
  const [caudal, nivel] = await Promise.all([pedirSerie(a.elemento, PRODUCTO.caudal, horas), pedirSerie(a.elemento, PRODUCTO.nivel, horas)]);
  if (caudal.umbrales.length && JSON.stringify(caudal.umbrales) !== a.umbrales) {
    await db.prepare("UPDATE aforos SET umbrales = ? WHERE slug = ?").bind(JSON.stringify(caudal.umbrales), a.slug).run();
  }
  const filas = juntar(caudal.puntos, nivel.puntos);
  await guardarLecturas(db, a.slug, filas);
  return filas;
}

/** Tarea cada 10 minutos: lecturas nuevas de todos los aforos. */
export async function actualizarAforos(env: Env): Promise<void> {
  for (const a of await aforosConfigurados(env.DB)) {
    try {
      await leerAforo(env.DB, a);
    } catch (e) {
      console.error("aforo", a.slug, e);
    }
  }
}

/** Variación del caudal en las últimas horas (para la flecha de tendencia). */
export function tendencia(serie: Lectura[], horas = 3): number | null {
  const con = serie.filter((s): s is [number, number, number | null] => s[1] !== null);
  const ultimo = con.at(-1);
  if (!ultimo) return null;
  const antes = [...con].reverse().find((s) => s[0] <= ultimo[0] - horas * 3600);
  return antes ? Math.round((ultimo[1] - antes[1]) * 100) / 100 : null;
}

/** Última lectura: el caudal llega unos minutos después que el nivel, así que se toma el último de cada uno. */
export function ultimaLectura(serie: Lectura[]): Aforo["ultimo"] {
  const c = [...serie].reverse().find((s) => s[1] !== null);
  const n = [...serie].reverse().find((s) => s[2] !== null);
  if (!c && !n) return null;
  return { t: (c ?? n)![0], caudal: c?.[1] ?? null, nivel: n?.[2] ?? null };
}

/** Aligera la serie: cada 10 minutos en las últimas 48 h y una lectura por hora en lo anterior. */
export function reducir(serie: Lectura[], ahora = Date.now() / 1000) {
  const limite = ahora - 48 * 3600;
  const out: Lectura[] = [];
  let horaAnterior = -1;
  for (const p of serie) {
    if (p[0] >= limite) out.push(p);
    else {
      const h = Math.floor(p[0] / 3600);
      if (h !== horaAnterior) out.push(p);
      horaAnterior = h;
    }
  }
  return out;
}

/** Caudal de las últimas 48 h, una lectura por hora (para la minigráfica de la tarjeta). */
export function miniSerie(serie: Lectura[], ahora = Date.now() / 1000): [number, number][] {
  const out: [number, number][] = [];
  let horaAnterior = -1;
  for (const [t, c] of serie) {
    if (t < ahora - 48 * 3600 || c === null) continue;
    const h = Math.floor(t / 3600);
    if (h !== horaAnterior) out.push([t, c]);
    horaAnterior = h;
  }
  return out;
}

async function lecturas(db: D1Database, a: FilaAforo, dias: number): Promise<Lectura[]> {
  const desde = Math.floor(Date.now() / 1000) - dias * 86400;
  const serie = (
    await db
      .prepare("SELECT t, caudal, nivel FROM aforo_lecturas WHERE estacion = ? AND t >= ? ORDER BY t")
      .bind(a.slug, desde)
      .all<{ t: number; caudal: number | null; nivel: number | null }>()
  ).results.map((r) => [r.t, r.caudal, r.nivel] as Lectura);
  if (serie.length) return serie;
  // Aforo recién añadido (o en local, sin tareas programadas): se lee ahora del Observatorio
  try {
    return await leerAforo(db, a);
  } catch (e) {
    console.error("aforo", a.slug, e);
    return [];
  }
}

async function normalHoy(db: D1Database, slug: string): Promise<Aforo["normalHoy"]> {
  const fila = await db.prepare("SELECT datos FROM aforo_resumen WHERE estacion = ?").bind(slug).first<{ datos: string }>();
  if (!fila) return null;
  const r: ResumenAforo = JSON.parse(fila.datos);
  return r.normal[diaHidrologico(fechaLocal(Date.now() / 1000))] ?? null;
}

function tarjeta(a: FilaAforo, serie: Lectura[], normal: Aforo["normalHoy"]): Aforo {
  return {
    ...configDe(a),
    ultimo: ultimaLectura(serie),
    tendencia: tendencia(serie),
    umbrales: a.umbrales ? JSON.parse(a.umbrales) : [],
    normalHoy: normal,
    mini: miniSerie(serie),
  };
}

/** Todos los aforos, para la portada de Ríos. */
export async function estadoAforos(env: Env): Promise<Aforo[]> {
  const aforos = await aforosConfigurados(env.DB);
  return Promise.all(aforos.map(async (a) => tarjeta(a, await lecturas(env.DB, a, 2), await normalHoy(env.DB, a.slug))));
}

const distanciaKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = Math.PI / 180;
  const x = (lon2 - lon1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const y = (lat2 - lat1) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

/** Página de un aforo: lecturas de 30 días y lluvia de la estación de Meteostar más cercana. */
export async function detalleAforo(env: Env, slug: string): Promise<DetalleAforo | null> {
  const a = await aforoPorSlug(env.DB, slug);
  if (!a) return null;
  const serie = await lecturas(env.DB, a, DIAS);
  const historico = await env.DB.prepare("SELECT 1 FROM aforo_diario WHERE estacion = ? AND fuente = 'anuario' LIMIT 1").bind(slug).first();
  // Lluvia: la estación pública más cercana (hasta 40 km) que tenga datos de lluvia de casi todo el periodo
  let lluvia: DetalleAforo["lluvia"] = null;
  const cercanas = (await estacionesPublicas(env.DB))
    .map((e) => ({ e, km: distanciaKm(a.lat, a.lon, e.lat, e.lon) }))
    .filter((x) => x.km <= 40)
    .sort((x, y) => x.km - y.km)
    .slice(0, 5);
  for (const { e, km } of cercanas) {
    const dias = await resumenes(env.DB, e.id, fechaLocal(Date.now() / 1000 - (DIAS - 1) * 86400));
    if (dias.filter((d) => d.lluvia !== null).length < DIAS * 0.6) continue;
    lluvia = { slug: e.slug, nombre: e.nombre, km: Math.round(km), dias: dias.map((d) => [d.fecha, d.lluvia]) };
    break;
  }
  return { ...tarjeta(a, serie, await normalHoy(env.DB, slug)), serie: reducir(serie), lluvia, tieneHistorico: !!historico };
}

/** Catálogo de aforos del Observatorio (para añadirlos), cacheado un día. */
export async function catalogoAforos(env: Env, ctx: Ctx): Promise<AforoCatalogo[]> {
  const url = `${OBSERVATORIO}${CAPA_AFOROS}`;
  const clave = new Request(url);
  let j: any;
  const guardada = await caches.default.match(clave);
  if (guardada) j = await guardada.json();
  else {
    j = await pedirObservatorio(CAPA_AFOROS);
    ctx.waitUntil(caches.default.put(clave, new Response(JSON.stringify(j), { headers: { "Cache-Control": "public, max-age=86400" } })));
  }
  const elegidos = new Set((await aforosConfigurados(env.DB)).map((a) => a.elemento));
  const vistos = new Set<string>();
  return (Array.isArray(j?.features) ? j.features : [])
    .map((f: any): AforoCatalogo | null => {
      const p = f?.properties ?? {};
      const [lon, lat] = f?.geometry?.coordinates ?? [];
      if (!p.id_element || typeof lat !== "number" || typeof lon !== "number" || vistos.has(p.id_element)) return null;
      vistos.add(p.id_element);
      return {
        elemento: String(p.id_element),
        nombre: String(p.name ?? "").trim(),
        demarcacion: DEMARCACIONES[String(p.cod_demar ?? "")] ?? "",
        lat,
        lon,
        elegido: elegidos.has(p.id_element),
      };
    })
    .filter((x: AforoCatalogo | null): x is AforoCatalogo => x !== null)
    .sort((a: AforoCatalogo, b: AforoCatalogo) => a.nombre.localeCompare(b.nombre, "es"));
}

const slugDe = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/** Añade un aforo del catálogo. Devuelve el slug o un error. */
export async function anadirAforo(
  env: Env,
  ctx: Ctx,
  datos: { elemento: string; nombre: string; rio: string; embalse: string | null; reguladoDesde: number | null },
): Promise<{ slug: string } | { error: string }> {
  const cat = (await catalogoAforos(env, ctx)).find((c) => c.elemento === datos.elemento);
  if (!cat) return { error: "Ese aforo no está en el catálogo del Observatorio" };
  if (cat.elegido) return { error: "Ese aforo ya está añadido" };
  let codigo: string | null = null;
  try {
    const est = await pedirObservatorio(`/api/Station/${encodeURIComponent(datos.elemento)}`);
    if (est?.stationNumber) codigo = String(est.stationNumber).padStart(5, "0");
  } catch {
    // Sin ficha: se añade igualmente, sin código
  }
  let slug = slugDe(datos.nombre) || "aforo";
  if (await aforoPorSlug(env.DB, slug)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  await env.DB.prepare(
    `INSERT INTO aforos (slug, nombre, rio, codigo, elemento, confederacion, lat, lon, embalse, regulado_desde, orden, creado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(max(orden), 0) + 1 FROM aforos), unixepoch())`,
  )
    .bind(slug, datos.nombre, datos.rio, codigo, datos.elemento, cat.demarcacion || null, cat.lat, cat.lon, datos.embalse, datos.reguladoDesde)
    .run();
  return { slug };
}

/** Quita un aforo y todos sus datos. */
export async function quitarAforo(db: D1Database, slug: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM aforos WHERE slug = ?").bind(slug),
    db.prepare("DELETE FROM aforo_lecturas WHERE estacion = ?").bind(slug),
    db.prepare("DELETE FROM aforo_diario WHERE estacion = ?").bind(slug),
    db.prepare("DELETE FROM aforo_max_mensual WHERE estacion = ?").bind(slug),
    db.prepare("DELETE FROM aforo_resumen WHERE estacion = ?").bind(slug),
  ]);
}
