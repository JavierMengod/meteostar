// Estaciones: lectura, validación y guardado (con la configuración del conector cifrada).
import type { Estacion, EstacionPropia, RespuestaDatos } from "../shared/tipos";
import { aleatorio } from "./auth";
import { cifrar, descifrar } from "./cifrado";
import { conector } from "./conectores";
import { lecturaCerca, resumen, ultimaLectura } from "./db";
import { fechaAnterior, fechaLocal } from "./fechas";

/** Fila de la tabla estaciones (con el nombre del propietario). */
export interface FilaEstacion {
  id: number;
  slug: string;
  usuario_id: number | null;
  /** Se ve destacada por defecto (sin cuenta) */
  destacado: number;
  tipo: "particular" | "oficial";
  red: string | null;
  nombre: string;
  municipio: string;
  provincia: string;
  lat: number;
  lon: number;
  altitud: number;
  descripcion: string | null;
  equipo: string | null;
  meteoclimatic: string | null;
  fuente: string;
  config: string | null;
  token: string | null;
  publica: number;
  activa: number;
  orden: number;
  creada: number;
  ultima_consulta: number | null;
  ultimo_error: string | null;
  propietario: string | null;
}

const SELECT = `SELECT e.*, u.nombre AS propietario FROM estaciones e LEFT JOIN usuarios u ON u.id = e.usuario_id`;
const ORDEN = `ORDER BY e.tipo DESC, e.orden, e.nombre`; // particulares primero

export function publica(f: FilaEstacion): Estacion {
  return {
    id: f.id,
    slug: f.slug,
    tipo: f.tipo,
    red: f.red,
    nombre: f.nombre,
    municipio: f.municipio,
    provincia: f.provincia,
    lat: f.lat,
    lon: f.lon,
    altitud: f.altitud,
    descripcion: f.descripcion,
    equipo: f.equipo,
    meteoclimatic: f.meteoclimatic,
    fuente: f.fuente,
    propietario: f.tipo === "particular" ? f.propietario : null,
  };
}

export const MASCARA = "••••••";

/** Estación vista por su dueño: con la clave de envío y la configuración (secretos ocultos). */
export async function propia(env: Env, f: FilaEstacion, ultima: number | null): Promise<EstacionPropia> {
  const con = conector(f.fuente);
  const config = await descifrar(env, f.config).catch(() => ({}) as Record<string, string>);
  const visible: Record<string, string> = {};
  for (const campo of con?.campos ?? []) {
    const v = config[campo.nombre] ?? "";
    visible[campo.nombre] = campo.tipo === "secreto" && v ? MASCARA : v;
  }
  return {
    ...publica(f),
    token: f.token,
    publica: !!f.publica,
    activa: !!f.activa,
    config: visible,
    ultima,
    ultima_consulta: f.ultima_consulta,
    ultimo_error: f.ultimo_error,
  };
}

export async function estacionesPublicas(db: D1Database): Promise<FilaEstacion[]> {
  return (await db.prepare(`${SELECT} WHERE e.publica = 1 AND e.activa = 1 ${ORDEN}`).all<FilaEstacion>()).results;
}

export async function estacionPorSlug(db: D1Database, slug: string): Promise<FilaEstacion | null> {
  return db.prepare(`${SELECT} WHERE e.slug = ?`).bind(slug).first<FilaEstacion>();
}

export async function estacionPorId(db: D1Database, id: number): Promise<FilaEstacion | null> {
  return db.prepare(`${SELECT} WHERE e.id = ?`).bind(id).first<FilaEstacion>();
}

export async function estacionPorToken(db: D1Database, token: string): Promise<FilaEstacion | null> {
  return db.prepare(`${SELECT} WHERE e.token = ? AND e.activa = 1`).bind(token).first<FilaEstacion>();
}

export async function estacionesDe(db: D1Database, usuarioId: number, todas: boolean): Promise<FilaEstacion[]> {
  const sql = todas ? `${SELECT} ${ORDEN}` : `${SELECT} WHERE e.usuario_id = ? ${ORDEN}`;
  const st = db.prepare(sql);
  return (await (todas ? st : st.bind(usuarioId)).all<FilaEstacion>()).results;
}

/** Datos actuales de una estación (tarjeta de la portada y cabecera de su página). */
export async function datosEstacion(db: D1Database, f: FilaEstacion, ahora: number): Promise<RespuestaDatos> {
  const hoy = fechaLocal(ahora);
  // Las fuentes horarias (AEMET) necesitan más margen para encontrar la lectura de hace una hora
  const margen = f.fuente === "aemet" ? 2400 : 600;
  const [actual, rHoy, rAyer, hace1h] = await Promise.all([
    ultimaLectura(db, f.id),
    resumen(db, f.id, hoy),
    resumen(db, f.id, fechaAnterior(hoy)),
    lecturaCerca(db, f.id, ahora - 3600, margen),
  ]);
  return { estacion: publica(f), actual, hoy: rHoy, ayer: rAyer, temp1h: hace1h?.temp ?? null, ahora };
}

// ----- Alta y edición -----

export interface DatosEstacion {
  nombre?: unknown;
  municipio?: unknown;
  provincia?: unknown;
  lat?: unknown;
  lon?: unknown;
  altitud?: unknown;
  descripcion?: unknown;
  equipo?: unknown;
  meteoclimatic?: unknown;
  fuente?: unknown;
  config?: unknown;
  publica?: unknown;
  activa?: unknown;
  tipo?: unknown;
  red?: unknown;
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function slugDe(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "estacion"
  );
}

async function slugLibre(db: D1Database, base: string, excepto?: number): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const fila = await db.prepare("SELECT id FROM estaciones WHERE slug = ?").bind(slug).first<{ id: number }>();
    if (!fila || fila.id === excepto) return slug;
  }
  return `${base}-${aleatorio(4).toLowerCase()}`;
}

/**
 * Valida los datos de una estación. Devuelve el error para el usuario o los valores limpios.
 * `anterior` es la configuración guardada (para conservar los secretos que llegan enmascarados).
 */
export async function validarEstacion(
  env: Env,
  d: DatosEstacion,
  esAdmin: boolean,
  anterior?: FilaEstacion,
): Promise<{ error: string } | { valores: Record<string, unknown> }> {
  const nombre = texto(d.nombre, 60);
  const municipio = texto(d.municipio, 60);
  const provincia = texto(d.provincia, 40);
  const lat = Number(d.lat);
  const lon = Number(d.lon);
  const altitud = Number(d.altitud);
  if (!nombre) return { error: "Falta el nombre de la estación" };
  if (!municipio || !provincia) return { error: "Faltan el municipio o la provincia" };
  if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) return { error: "Las coordenadas no son válidas" };
  if (!(altitud > -500 && altitud < 9000)) return { error: "La altitud no es válida" };
  const fuente = typeof d.fuente === "string" ? d.fuente : "";
  const con = conector(fuente);
  if (!con) return { error: "Elige de dónde vienen los datos" };
  if (con.soloAdmin && !esAdmin) return { error: "Esa fuente solo la puede usar el administrador" };

  // Configuración del conector: los secretos enmascarados conservan el valor anterior
  const viejo = anterior && anterior.fuente === fuente ? await descifrar(env, anterior.config).catch(() => ({}) as Record<string, string>) : {};
  const recibido = (d.config && typeof d.config === "object" ? d.config : {}) as Record<string, unknown>;
  const config: Record<string, string> = {};
  for (const campo of con.campos) {
    let v = texto(recibido[campo.nombre], 200);
    if (campo.tipo === "secreto" && v === MASCARA) v = viejo[campo.nombre] ?? "";
    if (campo.obligatorio && !v) return { error: `Falta «${campo.etiqueta}»` };
    if (v) config[campo.nombre] = v;
  }
  // En el envío directo, la reserva de ecowitt.net va completa o no va
  if (fuente === "directo") {
    const puestos = ["application_key", "api_key", "mac"].filter((k) => config[k]);
    if (puestos.length && puestos.length < 3) return { error: "Para la reserva de ecowitt.net hacen falta las tres claves (o ninguna)" };
  }

  const tipo = esAdmin && d.tipo === "oficial" ? "oficial" : "particular";
  return {
    valores: {
      nombre,
      municipio,
      provincia,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      altitud: Math.round(altitud),
      descripcion: texto(d.descripcion, 600) || null,
      equipo: texto(d.equipo, 120) || null,
      meteoclimatic: texto(d.meteoclimatic, 30).toUpperCase() || null,
      fuente,
      config: Object.keys(config).length ? await cifrar(env, config) : null,
      publica: d.publica === false ? 0 : 1,
      activa: d.activa === false ? 0 : 1,
      tipo,
      red: tipo === "oficial" ? texto(d.red, 40) || null : null,
    },
  };
}

export async function crearEstacion(db: D1Database, usuarioId: number, v: Record<string, unknown>): Promise<number> {
  const slug = await slugLibre(db, slugDe(String(v.nombre)));
  const token = v.fuente === "directo" ? aleatorio(18) : null;
  const r = await db
    .prepare(
      `INSERT INTO estaciones (slug, usuario_id, tipo, red, nombre, municipio, provincia, lat, lon, altitud, descripcion, equipo,
         meteoclimatic, fuente, config, token, publica, activa, creada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch()) RETURNING id`,
    )
    .bind(
      slug, usuarioId, v.tipo, v.red, v.nombre, v.municipio, v.provincia, v.lat, v.lon, v.altitud, v.descripcion, v.equipo,
      v.meteoclimatic, v.fuente, v.config, token, v.publica, v.activa,
    )
    .first<{ id: number }>();
  return r!.id;
}

export async function actualizarEstacion(db: D1Database, anterior: FilaEstacion, v: Record<string, unknown>) {
  // Si pasa a envío directo y no tenía clave de envío, se le crea una
  const token = v.fuente === "directo" ? (anterior.token ?? aleatorio(18)) : null;
  await db
    .prepare(
      `UPDATE estaciones SET tipo = ?, red = ?, nombre = ?, municipio = ?, provincia = ?, lat = ?, lon = ?, altitud = ?,
         descripcion = ?, equipo = ?, meteoclimatic = ?, fuente = ?, config = ?, token = ?, publica = ?, activa = ?,
         ultimo_error = CASE WHEN fuente = ? THEN ultimo_error ELSE NULL END
       WHERE id = ?`,
    )
    .bind(
      v.tipo, v.red, v.nombre, v.municipio, v.provincia, v.lat, v.lon, v.altitud, v.descripcion, v.equipo, v.meteoclimatic,
      v.fuente, v.config, token, v.publica, v.activa, v.fuente, anterior.id,
    )
    .run();
}
