// Embalses: API pública de MapasDeEmbalses.es (https://mapasdeembalses.es/aviso-legal/#legal-api).
// Datos del boletín semanal del MITECO y, cuando lo hay, el dato reciente del SAIH de cada cuenca.
// Condición de uso: atribución visible a MapasDeEmbalses.es y a la fuente original, y consultas razonables
// (aquí, todo pasa por la caché del Worker: 1 h el estado y 6 h el histórico).
import type { DetalleEmbalse, Embalse, EmbalseCatalogo, RespuestaEmbalses, SemanaEmbalse } from "../shared/tipos";
import { localAUnix } from "./fechas";

const API = "https://mapasdeembalses.es/api/v1";
const AGENTE = "Meteostar/1.0 (web meteorologica sin animo de lucro)";

type Ctx = { waitUntil(p: Promise<unknown>): void };

async function pedir(ruta: string, segundos: number, ctx: Ctx): Promise<any> {
  const url = `${API}${ruta}`;
  const cache = caches.default;
  const clave = new Request(url);
  const guardada = await cache.match(clave);
  if (guardada) return guardada.json();
  const r = await fetch(url, { headers: { "User-Agent": AGENTE, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`MapasDeEmbalses HTTP ${r.status} en ${ruta}`);
  const texto = await r.text();
  ctx.waitUntil(cache.put(clave, new Response(texto, { headers: { "Cache-Control": `public, max-age=${segundos}`, "Content-Type": "application/json" } })));
  return JSON.parse(texto);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Semana del histórico más cercana a una fecha (como mucho a 4 días). */
function semanaCerca(historico: SemanaEmbalse[], fecha: string): SemanaEmbalse | null {
  const objetivo = Date.parse(`${fecha}T12:00:00Z`);
  let mejor: SemanaEmbalse | null = null;
  let distancia = 4.5 * 86400_000;
  for (const s of historico) {
    const d = Math.abs(Date.parse(`${s.fecha}T12:00:00Z`) - objetivo);
    if (d < distancia && s.volumen !== null) {
      mejor = s;
      distancia = d;
    }
  }
  return mejor;
}

const restarAnios = (fecha: string, n: number) => `${Number(fecha.slice(0, 4)) - n}${fecha.slice(4)}`;

/** Semanas del histórico en el formato de la web, ordenadas. */
function semanasDe(historico: any[] | null): SemanaEmbalse[] {
  return (historico ?? [])
    .map((s) => ({ fecha: s.fecha, volumen: num(s.volumen_hm3), porcentaje: num(s.fill_percentage), variacion: num(s.variacion_semanal_hm3) }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

/** La misma semana del año pasado y la media de esa semana en los años anteriores. */
export function comparar(semanas: SemanaEmbalse[], fecha: string | null) {
  let haceUnAnio: SemanaEmbalse | null = null;
  let mediaSemana: { volumen: number; porcentaje: number; anios: number } | null = null;
  if (!fecha) return { haceUnAnio, mediaSemana };
  haceUnAnio = semanaCerca(semanas, restarAnios(fecha, 1));
  const anteriores: SemanaEmbalse[] = [];
  for (let n = 1; n <= 30; n++) {
    const s = semanaCerca(semanas, restarAnios(fecha, n));
    if (s) anteriores.push(s);
    else if (restarAnios(fecha, n) < (semanas[0]?.fecha ?? "")) break;
  }
  if (anteriores.length) {
    const media = (f: (s: SemanaEmbalse) => number | null) => {
      const v = anteriores.map(f).filter((x): x is number => x !== null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0;
    };
    mediaSemana = { volumen: media((s) => s.volumen), porcentaje: media((s) => s.porcentaje), anios: anteriores.length };
  }
  return { haceUnAnio, mediaSemana };
}

/** Convierte la ficha y el histórico de un embalse al formato de la web. */
export function adaptarEmbalse(ficha: any, historico: any[] | null): Embalse {
  const d = ficha;
  const obs = d.observacion ?? {};
  const semanas = (historico ?? []).filter((s) => num(s.volumen_hm3) !== null).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  // Máximo y mínimo del histórico disponible
  let maximo: Embalse["maximo"] = null;
  let minimo: Embalse["minimo"] = null;
  for (const s of semanas) {
    if (!maximo || s.volumen_hm3 > maximo.volumen) maximo = { volumen: s.volumen_hm3, fecha: s.fecha };
    if (!minimo || s.volumen_hm3 < minimo.volumen) minimo = { volumen: s.volumen_hm3, fecha: s.fecha };
  }
  // Dato reciente del SAIH: solo si es de los últimos 3 días y posterior al semanal
  let reciente: Embalse["reciente"] = null;
  const r = d.dato_reciente;
  if (r?.observed_at) {
    // La API da las horas en hora de Madrid
    const ts = localAUnix(String(r.observed_at));
    const semanal = obs.fecha ? Date.parse(`${obs.fecha}T12:00:00Z`) / 1000 : 0;
    if (Number.isFinite(ts) && Date.now() / 1000 - ts < 3 * 86400 && ts > semanal) {
      reciente = { ts, volumen: num(r.volumen_hm3), porcentaje: num(r.fill_percentage), nivel: num(r.nivel_m), fuente: String(r.fuente ?? "SAIH") };
    }
  }
  const { haceUnAnio, mediaSemana } = comparar(semanasDe(historico), obs.fecha ?? null);
  return {
    slug: d.slug,
    nombre: d.nombre,
    rio: d.rio_canonico ?? d.rio ?? null,
    provincia: d.provincia,
    cuenca: d.cuenca,
    lat: num(d.coordenadas?.lat),
    lon: num(d.coordenadas?.lng),
    capacidad: num(obs.capacidad_hm3) ?? num(d.capacidad_catalogo_hm3),
    volumen: num(obs.volumen_hm3),
    porcentaje: num(obs.fill_percentage),
    variacion: num(obs.variacion_semanal_hm3),
    fecha: obs.fecha ?? null,
    reciente,
    serie: semanas.slice(-53).map((s) => [s.fecha, num(s.fill_percentage)]),
    maximo,
    minimo,
    desde: semanas[0]?.fecha ?? null,
    url: `https://mapasdeembalses.es/embalse/${d.slug}/`,
    anioPasado: haceUnAnio?.porcentaje ?? null,
    media: mediaSemana ? { porcentaje: mediaSemana.porcentaje, anios: mediaSemana.anios } : null,
  };
}

export async function embalsesPorDefecto(db: D1Database): Promise<string[]> {
  return (await db.prepare("SELECT slug FROM embalses WHERE destacado = 1 ORDER BY orden").all<{ slug: string }>()).results.map((r) => r.slug);
}

export async function embalsesElegidos(db: D1Database): Promise<string[]> {
  return (await db.prepare("SELECT slug FROM embalses ORDER BY orden, creado").all<{ slug: string }>()).results.map((r) => r.slug);
}

export async function estadoEmbalses(env: Env, ctx: Ctx): Promise<RespuestaEmbalses> {
  const slugs = (await embalsesElegidos(env.DB)).slice(0, 20);
  const errores: string[] = [];
  const lista = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const [ficha, hist] = await Promise.all([
          pedir(`/embalses/${encodeURIComponent(slug)}`, 3600, ctx),
          pedir(`/embalses/${encodeURIComponent(slug)}/historico`, 6 * 3600, ctx).catch(() => null),
        ]);
        return adaptarEmbalse(ficha.data, hist?.data ?? null);
      } catch (e) {
        console.error("embalse", slug, e);
        errores.push(slug);
        return null;
      }
    }),
  );
  const embalses = lista.filter((e): e is Embalse => e !== null);
  const fechas = embalses.map((e) => e.fecha).filter((f): f is string => !!f).sort();
  return { fecha: fechas.at(-1) ?? null, porDefecto: await embalsesPorDefecto(env.DB), embalses, errores };
}

/** Todos los embalses de España (para elegir), cacheado un día. */
export async function catalogo(env: Env, ctx: Ctx): Promise<EmbalseCatalogo[]> {
  const elegidos = new Set(await embalsesElegidos(env.DB));
  const todos: any[] = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const j = await pedir(`/embalses?per_page=100&page=${pagina}`, 86400, ctx);
    todos.push(...(j.data ?? []));
    if ((j.data ?? []).length < 100) break;
  }
  return todos
    .map((e) => ({
      slug: e.slug,
      nombre: e.nombre,
      provincia: e.provincia,
      cuenca: e.cuenca,
      capacidad: num(e.capacidad_hm3),
      porcentaje: num(e.fill_percentage),
      elegido: elegidos.has(e.slug),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Página de un embalse: ficha, histórico completo y comparativas con otros años. */
export function adaptarDetalle(ficha: any, historico: any[] | null): DetalleEmbalse {
  const base = adaptarEmbalse(ficha, historico);
  const semanas = semanasDe(historico);
  const { haceUnAnio, mediaSemana } = comparar(semanas, base.fecha);
  return {
    ...base,
    municipio: ficha.municipio ?? null,
    anioConstruccion: num(ficha["año_construccion"]),
    uso: ficha.uso_principal ?? null,
    historico: semanas,
    haceUnAnio,
    mediaSemana,
  };
}

export async function detalleEmbalse(slug: string, ctx: Ctx): Promise<DetalleEmbalse> {
  const [ficha, hist] = await Promise.all([
    pedir(`/embalses/${encodeURIComponent(slug)}`, 3600, ctx),
    pedir(`/embalses/${encodeURIComponent(slug)}/historico`, 6 * 3600, ctx).catch(() => null),
  ]);
  return adaptarDetalle(ficha.data, hist?.data ?? null);
}
