// Estaciones de otras redes de aficionados (por ahora, Meteoclimatic) que el administrador añade a Meteostar desde
// un mapa. Se guardan como estaciones de tipo «externa»: se leen con su conector y se muestran aparte de las de la red.
import type { EstacionExterna } from "../shared/tipos";
import { cifrar } from "./cifrado";
import { crearEstacion } from "./estaciones";
import { PROVINCIAS_MC, catalogoProvincia, regionDe } from "./meteoclimatic";

/** Estaciones de una provincia de Meteoclimatic, marcando las que ya están en Meteostar. */
export async function catalogoExternas(db: D1Database, region: string): Promise<EstacionExterna[]> {
  const lista = await catalogoProvincia(region);
  // Ya en Meteostar: las añadidas desde aquí (externas) y las de la red que publican en Meteoclimatic (como Villastar)
  const enRed = new Map(
    (await db.prepare("SELECT slug, nombre, tipo, upper(meteoclimatic) AS codigo FROM estaciones WHERE meteoclimatic IS NOT NULL").all<{ slug: string; nombre: string; tipo: string; codigo: string }>())
      .results.map((f) => [f.codigo, f]),
  );
  return lista.map((e) => {
    const f = enRed.get(e.codigo);
    return { ...e, fuente: "meteoclimatic", enMeteostar: f ? { slug: f.slug, nombre: f.nombre, externa: f.tipo === "externa" } : null };
  });
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

/** Añade una estación de Meteoclimatic (los datos salen del propio catálogo, no de lo que mande el navegador). */
export async function anadirExterna(env: Env, adminId: number, codigo: string): Promise<{ slug: string } | { error: string }> {
  if (!/^[A-Z0-9]{10,25}$/.test(codigo)) return { error: "Código no válido" };
  const region = regionDe(codigo);
  const e = (await catalogoProvincia(region)).find((x) => x.codigo === codigo);
  if (!e) return { error: "Esa estación no está en Meteoclimatic" };
  const ya = await env.DB.prepare("SELECT slug FROM estaciones WHERE upper(meteoclimatic) = ?").bind(codigo).first<{ slug: string }>();
  if (ya) return { error: "Esa estación ya está en Meteostar" };
  const id = await crearEstacion(env.DB, adminId, {
    tipo: "externa",
    red: "Meteoclimatic",
    nombre: e.nombre,
    // «Albarracín - Dornaque»: el pueblo es lo de antes del guion
    municipio: e.nombre.split(" - ")[0].trim(),
    provincia: PROVINCIAS_MC[region] ?? region,
    lat: e.lat,
    lon: e.lon,
    altitud: await altitudDe(e.lat, e.lon),
    descripcion: null,
    equipo: null,
    meteoclimatic: codigo,
    fuente: "meteoclimatic",
    config: await cifrar(env, { codigo }),
    publica: 1,
    activa: 1,
  });
  const f = await env.DB.prepare("SELECT slug FROM estaciones WHERE id = ?").bind(id).first<{ slug: string }>();
  return { slug: f!.slug };
}

/** Quita una estación externa con sus lecturas (solo las añadidas desde el mapa, nunca las de la red). */
export async function quitarExterna(db: D1Database, codigo: string): Promise<boolean> {
  const f = await db.prepare("SELECT id FROM estaciones WHERE tipo = 'externa' AND upper(meteoclimatic) = ?").bind(codigo).first<{ id: number }>();
  if (!f) return false;
  await db.batch([
    db.prepare("DELETE FROM lecturas WHERE estacion_id = ?").bind(f.id),
    db.prepare("DELETE FROM resumen_diario WHERE estacion_id = ?").bind(f.id),
    db.prepare("DELETE FROM favoritos WHERE tipo = 'estacion' AND slug = (SELECT slug FROM estaciones WHERE id = ?)").bind(f.id),
    db.prepare("DELETE FROM estaciones WHERE id = ?").bind(f.id),
  ]);
  return true;
}
