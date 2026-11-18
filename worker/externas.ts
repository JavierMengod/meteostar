// Estaciones de otras redes de aficionados (Meteoclimatic y Weather Underground) que el administrador añade a
// Meteostar desde el mapa. Se guardan como estaciones de tipo «externa»: se leen con su conector y se muestran aparte
// de las de la red. Las que no están dadas de alta solo se enseñan en el mapa, sin guardar sus datos.
import type { EstacionExterna } from "../shared/tipos";
import { cifrar } from "./cifrado";
import { crearEstacion } from "./estaciones";
import { PROVINCIAS_GUARDADAS, PROVINCIAS_MC, catalogoGuardado, catalogoProvincia, regionDe } from "./meteoclimatic";
import { MAX_DADAS_DE_ALTA, listaWU } from "./wunderground";

type Fuente = EstacionExterna["fuente"];
const COLUMNA: Record<Fuente, "meteoclimatic" | "wunderground"> = { meteoclimatic: "meteoclimatic", wunderground: "wunderground" };

/** Estaciones de Meteostar con código en esa red: código → estación. */
async function yaEnMeteostar(db: D1Database, fuente: Fuente) {
  const col = COLUMNA[fuente];
  const filas = (
    await db.prepare(`SELECT slug, nombre, tipo, upper(${col}) AS codigo FROM estaciones WHERE ${col} IS NOT NULL`).all<{ slug: string; nombre: string; tipo: string; codigo: string }>()
  ).results;
  return new Map(filas.map((f) => [f.codigo, { slug: f.slug, nombre: f.nombre, externa: f.tipo === "externa" }]));
}

/** Estaciones de una provincia de Meteoclimatic, marcando las que ya están en Meteostar. */
export async function catalogoExternas(db: D1Database, region: string): Promise<EstacionExterna[]> {
  // Las provincias del mapa de Estaciones, de la lista guardada (incluye las que ahora no salen en el feed)
  const lista = PROVINCIAS_GUARDADAS.includes(region) ? await catalogoGuardado(db, region) : await catalogoProvincia(region);
  // Ya en Meteostar: las añadidas desde el mapa (externas) y las de la red que publican en Meteoclimatic (como Villastar)
  const enRed = await yaEnMeteostar(db, "meteoclimatic");
  return lista.map((e) => ({ ...e, fuente: "meteoclimatic", enMeteostar: enRed.get(e.codigo) ?? null }));
}

/** Estaciones de Weather Underground de la zona (sin dato: se pide al pulsar cada una). */
export async function catalogoWU(env: Env): Promise<EstacionExterna[]> {
  const enRed = await yaEnMeteostar(env.DB, "wunderground");
  return (await listaWU(env)).map((e) => ({ ...e, fuente: "wunderground", t: null, temp: null, qos: null, enMeteostar: enRed.get(e.codigo.toUpperCase()) ?? null }));
}

async function altitudDe(lat: number, lon: number): Promise<number> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, { signal: AbortSignal.timeout(10_000) });
    const j: { elevation?: number[] } = await r.json();
    return Math.round(j.elevation?.[0] ?? 0);
  } catch {
    return 0;
  }
}

/** Añade una estación de otra red (los datos salen de la lista del servidor, no de lo que mande el navegador). */
export async function anadirExterna(env: Env, adminId: number, fuente: Fuente, codigo: string): Promise<{ slug: string } | { error: string }> {
  if (!/^[A-Z0-9]{4,25}$/.test(codigo)) return { error: "Código no válido" };
  const col = COLUMNA[fuente];
  if (!col) return { error: "Red no válida" };
  const ya = await env.DB.prepare(`SELECT slug FROM estaciones WHERE upper(${col}) = ?`).bind(codigo).first<{ slug: string }>();
  if (ya) return { error: "Esa estación ya está en Meteostar" };

  let datos: { nombre: string; lat: number; lon: number; provincia: string; config: Record<string, string> };
  if (fuente === "meteoclimatic") {
    const region = regionDe(codigo);
    const e =
      (await catalogoProvincia(region)).find((x) => x.codigo === codigo) ??
      (PROVINCIAS_GUARDADAS.includes(region) ? (await catalogoGuardado(env.DB, region)).find((x) => x.codigo === codigo) : undefined);
    if (!e) return { error: "Esa estación no está en Meteoclimatic" };
    datos = { nombre: e.nombre, lat: e.lat, lon: e.lon, provincia: PROVINCIAS_MC[region] ?? region, config: { codigo } };
  } else {
    const n = await env.DB.prepare("SELECT count(*) AS n FROM estaciones WHERE tipo = 'externa' AND fuente = 'wunderground'").first<number>("n");
    if ((n ?? 0) >= MAX_DADAS_DE_ALTA) return { error: `Como mucho ${MAX_DADAS_DE_ALTA} estaciones de Weather Underground (cada una gasta peticiones de la clave)` };
    const e = (await listaWU(env)).find((x) => x.codigo.toUpperCase() === codigo);
    if (!e) return { error: "Esa estación no está en la lista de Weather Underground" };
    // La clave general de la web no se guarda en la estación: el conector la toma de la configuración
    datos = { nombre: e.nombre, lat: e.lat, lon: e.lon, provincia: "Teruel", config: { estacion: e.codigo } };
  }
  const id = await crearEstacion(env.DB, adminId, {
    tipo: "externa",
    red: fuente === "meteoclimatic" ? "Meteoclimatic" : "Weather Underground",
    nombre: datos.nombre,
    // «Albarracín - Dornaque»: el pueblo es lo de antes del guion
    municipio: datos.nombre.split(" - ")[0].trim(),
    provincia: datos.provincia,
    lat: datos.lat,
    lon: datos.lon,
    altitud: await altitudDe(datos.lat, datos.lon),
    descripcion: null,
    equipo: null,
    meteoclimatic: fuente === "meteoclimatic" ? codigo : null,
    fuente,
    config: await cifrar(env, datos.config),
    publica: 1,
    activa: 1,
  });
  if (fuente === "wunderground") await env.DB.prepare("UPDATE estaciones SET wunderground = ? WHERE id = ?").bind(codigo, id).run();
  const f = await env.DB.prepare("SELECT slug FROM estaciones WHERE id = ?").bind(id).first<{ slug: string }>();
  return { slug: f!.slug };
}

/** Quita una estación externa con sus lecturas (solo las añadidas desde el mapa, nunca las de la red). */
export async function quitarExterna(db: D1Database, codigo: string): Promise<boolean> {
  const f = await db
    .prepare("SELECT id FROM estaciones WHERE tipo = 'externa' AND (upper(meteoclimatic) = ?1 OR upper(wunderground) = ?1)")
    .bind(codigo)
    .first<{ id: number }>();
  if (!f) return false;
  await db.batch([
    db.prepare("DELETE FROM lecturas WHERE estacion_id = ?").bind(f.id),
    db.prepare("DELETE FROM resumen_diario WHERE estacion_id = ?").bind(f.id),
    db.prepare("DELETE FROM favoritos WHERE tipo = 'estacion' AND slug = (SELECT slug FROM estaciones WHERE id = ?)").bind(f.id),
    db.prepare("DELETE FROM estaciones WHERE id = ?").bind(f.id),
  ]);
  return true;
}
