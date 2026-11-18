// Estaciones de otras redes de aficionados (Meteoclimatic y Weather Underground) que el administrador añade a
// Meteostar desde el mapa. Se guardan como estaciones de tipo «externa»: se leen con su conector y se muestran aparte
// de las de la red. Las que no están dadas de alta solo se enseñan en el mapa, sin guardar sus datos.
import type { EstacionExterna } from "../shared/tipos";
import { cifrar } from "./cifrado";
import { crearEstacion } from "./estaciones";
import { PROVINCIAS_GUARDADAS, PROVINCIAS_MC, catalogoGuardado, catalogoProvincia, regionDe } from "./meteoclimatic";
import { MAX_DADAS_DE_ALTA, listaWU } from "./wunderground";

const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Gemelas confirmadas y avisos de calidad de una red: código → dato. */
async function cruceDe(db: D1Database, red: "meteoclimatic" | "wunderground") {
  const [mio, otro] = red === "meteoclimatic" ? ["mc", "wu"] : ["wu", "mc"];
  const gemelas = new Map(
    (
      await db
        // Una sola gemela por estación de Meteoclimatic: la más cercana de las que coinciden (en un pueblo puede haber
        // varias de Weather Underground que hoy marquen lo mismo sin ser la misma)
        .prepare(
          `SELECT ${mio} AS codigo, ${otro} AS gemela FROM gemelas g WHERE iguales >= 1 AND iguales > distintos
           AND km = (SELECT min(km) FROM gemelas h WHERE h.mc = g.mc AND h.iguales >= 1 AND h.iguales > h.distintos)`,
        )
        .all<{ codigo: string; gemela: string }>()
    ).results.map((g) => [g.codigo, g.gemela]),
  );
  const avisos = new Map(
    (await db.prepare("SELECT codigo, aviso FROM avisos_estacion WHERE red = ?").bind(red).all<{ codigo: string; aviso: string }>()).results.map((a) => [
      a.codigo,
      a.aviso,
    ]),
  );
  return { gemelas, avisos };
}

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
  const { gemelas, avisos } = await cruceDe(db, "meteoclimatic");
  return lista.map((e) => ({
    ...e,
    fuente: "meteoclimatic",
    enMeteostar: enRed.get(e.codigo) ?? null,
    gemela: gemelas.get(e.codigo) ?? null,
    aviso: avisos.get(e.codigo) ?? null,
  }));
}

/** Estaciones de Weather Underground de la zona (sin dato: se pide al pulsar cada una). */
export async function catalogoWU(env: Env): Promise<EstacionExterna[]> {
  const enRed = await yaEnMeteostar(env.DB, "wunderground");
  const { gemelas, avisos } = await cruceDe(env.DB, "wunderground");
  return (await listaWU(env)).map((e) => ({
    ...e,
    fuente: "wunderground",
    t: null,
    temp: null,
    qos: null,
    enMeteostar: enRed.get(e.codigo.toUpperCase()) ?? null,
    gemela: gemelas.get(e.codigo) ?? null,
    aviso: avisos.get(e.codigo) ?? null,
  }));
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

/** Estaciones de otras redes que puede dar de alta cada usuario (el administrador, sin límite). */
export const MAX_EXTERNAS_USUARIO = 5;

export interface QuienDaDeAlta {
  id: number;
  rol: string;
}

/**
 * Añade una estación de otra red (los datos salen de la lista del servidor, no de lo que mande el navegador).
 * Da igual de qué red se elija: si una de Weather Underground es la misma que una de Meteoclimatic (gemela), se da
 * de alta como una sola estación: lecturas de Meteoclimatic (no gastan peticiones) e histórico de Weather Underground.
 */
export async function anadirExterna(env: Env, quien: QuienDaDeAlta, fuenteElegida: Fuente, codigoElegido: string): Promise<{ slug: string } | { error: string }> {
  if (!/^[A-Z0-9]{4,25}$/.test(codigoElegido)) return { error: "Código no válido" };
  if (!COLUMNA[fuenteElegida]) return { error: "Red no válida" };
  let fuente = fuenteElegida;
  let codigo = codigoElegido;
  if (fuente === "wunderground") {
    const mc = await env.DB.prepare("SELECT mc FROM gemelas WHERE wu = ? AND iguales >= 1 AND iguales > distintos ORDER BY km LIMIT 1").bind(codigo).first<string>("mc");
    if (mc) {
      fuente = "meteoclimatic";
      codigo = mc;
    }
  }
  // ¿Ya está (por esta red o por su gemela en la otra)?
  const gemela =
    fuente === "meteoclimatic"
      ? await env.DB.prepare("SELECT wu FROM gemelas WHERE mc = ? AND iguales >= 1 AND iguales > distintos ORDER BY km LIMIT 1").bind(codigo).first<string>("wu")
      : null;
  const ya = await env.DB.prepare(`SELECT slug FROM estaciones WHERE upper(${COLUMNA[fuente]}) = ?1 OR (?2 IS NOT NULL AND upper(wunderground) = ?2)`)
    .bind(codigo, gemela)
    .first<{ slug: string }>();
  if (ya) return { error: "Esa estación ya está en Meteostar" };
  // Límite por usuario
  if (quien.rol !== "admin") {
    const suyas = await env.DB.prepare("SELECT count(*) AS n FROM estaciones WHERE tipo = 'externa' AND usuario_id = ?").bind(quien.id).first<number>("n");
    if ((suyas ?? 0) >= MAX_EXTERNAS_USUARIO) return { error: `Puedes dar de alta como mucho ${MAX_EXTERNAS_USUARIO} estaciones de otras redes. Quita alguna desde tu cuenta para añadir otra.` };
  }

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
  const id = await crearEstacion(env.DB, quien.id, {
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
  // Histórico de Weather Underground: el de la propia estación o, si es de Meteoclimatic, el de su gemela (si la tiene)
  const deHistorico =
    fuente === "wunderground"
      ? codigo
      : ((await env.DB.prepare("SELECT wu FROM gemelas WHERE mc = ? AND iguales >= 1 AND iguales > distintos ORDER BY km LIMIT 1").bind(codigo).first<string>("wu")) ?? null);
  if (deHistorico) {
    const ayer = sumarDias(new Date().toISOString().slice(0, 10), -1);
    await env.DB.prepare("UPDATE estaciones SET historico_wu = ?, historico_pendiente = ?, historico_vacios = 0 WHERE id = ?").bind(deHistorico, ayer, id).run();
  }
  const f = await env.DB.prepare("SELECT slug FROM estaciones WHERE id = ?").bind(id).first<{ slug: string }>();
  return { slug: f!.slug };
}

/**
 * Quita una estación externa con sus lecturas (solo las de otras redes, nunca las de la red). La puede quitar quien la
 * dio de alta o el administrador.
 */
export async function quitarExterna(db: D1Database, codigo: string, quien: QuienDaDeAlta): Promise<true | { error: string }> {
  const f = await db
    .prepare("SELECT id, usuario_id FROM estaciones WHERE tipo = 'externa' AND (upper(meteoclimatic) = ?1 OR upper(wunderground) = ?1)")
    .bind(codigo)
    .first<{ id: number; usuario_id: number | null }>();
  if (!f) return { error: "No está en Meteostar" };
  if (quien.rol !== "admin" && f.usuario_id !== quien.id) return { error: "Solo la puede quitar quien la dio de alta" };
  await db.batch([
    db.prepare("DELETE FROM lecturas WHERE estacion_id = ?").bind(f.id),
    db.prepare("DELETE FROM resumen_diario WHERE estacion_id = ?").bind(f.id),
    db.prepare("DELETE FROM favoritos WHERE tipo = 'estacion' AND slug = (SELECT slug FROM estaciones WHERE id = ?)").bind(f.id),
    db.prepare("DELETE FROM estaciones WHERE id = ?").bind(f.id),
  ]);
  return true;
}
