// API pública: la red, cada estación, previsión, radar, satélite y recepción de datos.
import { Hono } from "hono";
import type { Lectura, RespuestaEstacion, RespuestaRed, SeriesRed } from "../../shared/tipos";
import {
  DIAS_LECTURAS,
  extremos,
  guardarLectura,
  historico,
  lecturaCerca,
  lluviaEntre,
  mediaVientoDesde,
  primerDia,
  resumen,
  resumenes,
  serieTemperatura,
  ultimaLectura,
  vientoDesde,
} from "../db";
import { leerEnvioConsola } from "../ecowitt";
import { datosEstacion, estacionesPublicas, estacionPorSlug, estacionPorToken, type FilaEstacion } from "../estaciones";
import { fechaAnterior, fechaLocal, inicioDia } from "../fechas";
import { detalleEmbalse, estadoEmbalses } from "../embalses";
import { catalogoExternas, catalogoWU } from "../externas";
import { CUPO_FICHAS, observacionWU, resumenObservacion } from "../wunderground";
import { PROVINCIAS_MC } from "../meteoclimatic";
import { obtenerPrevision } from "../prevision";
import { detalleAforo, estadoAforos } from "../aforos";
import { anioAforo, previsionAforo, resumenAforo } from "../historico-aforos";
import { radar, teselaRadar } from "../radar";
import { CAPAS_SATELITE, imagenSatelite, PASOS, satelite, type CapaSatelite } from "../seguimiento";

export const ahora = () => Math.floor(Date.now() / 1000);

const app = new Hono<{ Bindings: Env; Variables: { estacion: FilaEstacion } }>();

// ----- Recepción de datos (envío directo) -----
// La consola se configura con la ruta /api/ingest/<clave de la estación>.
// Protocolo Ecowitt: POST con formulario. Protocolo Weather Underground: GET con parámetros.
async function recibir(c: any, campos: Record<string, unknown>) {
  const f = await estacionPorToken(c.env.DB, c.req.param("token"));
  if (!f || f.fuente !== "directo") return c.text("forbidden", 403);
  const lectura = leerEnvioConsola(campos, ahora());
  if (lectura.temp === null && lectura.viento === null) return c.text("sin datos", 400);
  await guardarLectura(c.env.DB, f.id, lectura);
  return c.text("success");
}
app.post("/ingest/:token", async (c) => recibir(c, await c.req.parseBody()));
app.get("/ingest/:token", async (c) => recibir(c, c.req.query()));

// ----- La red -----

const red = (env: Env) => ({
  nombre: env.RED_NOMBRE,
  titulo: env.RED_TITULO,
  subtitulo: env.RED_SUBTITULO,
  lugar: env.RED_LUGAR,
  lat: Number(env.RED_LAT),
  lon: Number(env.RED_LON),
  altitud: Number(env.RED_ALTITUD),
});

app.get("/red", async (c) => {
  const t = ahora();
  const filas = await estacionesPublicas(c.env.DB);
  const respuesta: RespuestaRed = {
    red: red(c.env),
    estaciones: await Promise.all(filas.map((f) => datosEstacion(c.env.DB, f, t))),
    ahora: t,
    porDefecto: filas.filter((f) => f.destacado).map((f) => f.slug),
  };
  c.header("Cache-Control", "no-cache");
  return c.json(respuesta);
});

/** Temperatura de las últimas horas de todas las estaciones (gráfica comparativa). */
app.get("/red/temperaturas", async (c) => {
  const horas = Math.min(Math.max(Number(c.req.query("horas")) || 24, 1), 48);
  const filas = await estacionesPublicas(c.env.DB);
  const desde = ahora() - horas * 3600;
  const series: SeriesRed = {};
  await Promise.all(filas.map(async (f) => (series[f.slug] = await serieTemperatura(c.env.DB, f.id, desde))));
  c.header("Cache-Control", "public, max-age=120");
  return c.json(series);
});

/**
 * Todas las estaciones de Meteoclimatic de una provincia (por defecto, Teruel) con su dato actual, para el mapa de
 * Estaciones. Se lee del feed de la provincia (en caché unos minutos) y no se guarda: solo se guardan las dadas de alta.
 */
app.get("/estaciones/meteoclimatic", async (c) => {
  const region = c.req.query("provincia") ?? "ESARA44";
  if (!PROVINCIAS_MC[region]) return c.json({ error: "Provincia no válida" }, 400);
  try {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(await catalogoExternas(c.env.DB, region));
  } catch (e) {
    console.error(e);
    return c.json({ error: "No se ha podido leer Meteoclimatic" }, 502);
  }
});

/** Estaciones de Weather Underground de la zona (nombre y posición; la lista se renueva una vez al día). */
app.get("/estaciones/wunderground", async (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(await catalogoWU(c.env));
});

/** Dato actual de una estación de Weather Underground (al pulsarla en el mapa; 10 minutos en caché). */
app.get("/estaciones/wunderground/:codigo", async (c) => {
  const codigo = c.req.param("codigo").toUpperCase();
  if (!(await c.env.DB.prepare("SELECT 1 FROM wunderground WHERE upper(codigo) = ?").bind(codigo).first())) return c.json({ error: "Estación no encontrada" }, 404);
  try {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(resumenObservacion(await observacionWU(c.env, codigo, CUPO_FICHAS)));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "No disponible" }, 503);
  }
});

// ----- Una estación -----

app.use("/estaciones/:slug/*", async (c, next) => {
  const f = await estacionPorSlug(c.env.DB, c.req.param("slug"));
  if (!f || !f.activa) return c.json({ error: "estación no encontrada" }, 404);
  c.set("estacion", f);
  await next();
});

app.get("/estaciones/:slug/datos", async (c) => {
  c.header("Cache-Control", "no-cache");
  return c.json(await datosEstacion(c.env.DB, c.get("estacion"), ahora()));
});

app.get("/estaciones/:slug/historico", async (c) => {
  const horas = Math.min(Math.max(Number(c.req.query("horas")) || 24, 1), DIAS_LECTURAS * 24);
  c.header("Cache-Control", "no-cache");
  return c.json(await historico(c.env.DB, c.get("estacion").id, ahora() - horas * 3600));
});

/** Resumen de cada día: los últimos «dias» (hasta 20 años) o todos con dias=todo. */
app.get("/estaciones/:slug/resumen", async (c) => {
  const q = c.req.query("dias");
  const dias = q === "todo" ? 7305 : Math.min(Math.max(Number(q) || 30, 1), 7305);
  c.header("Cache-Control", "public, max-age=300");
  return c.json(await resumenes(c.env.DB, c.get("estacion").id, fechaLocal(ahora() - (dias - 1) * 86400)));
});

/** Extremos, medias y totales de un año (para elegir el año en «Extremos y récords»). */
app.get("/estaciones/:slug/extremos", async (c) => {
  const anio = Number(c.req.query("anio"));
  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) return c.json({ error: "año no válido" }, 400);
  c.header("Cache-Control", "public, max-age=300");
  return c.json(await extremos(c.env.DB, c.get("estacion").id, `${anio}-01-01`, `${anio}-12-31`));
});

app.get("/estaciones/:slug/dia", async (c) => {
  const fecha = c.req.query("fecha") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return c.json({ error: "fecha no válida" }, 400);
  return c.json(await resumen(c.env.DB, c.get("estacion").id, fecha));
});

/**
 * Lluvia caída entre dos lecturas. lluvia_dia se reinicia a medianoche:
 * si las lecturas son de días distintos, se suma lo que faltaba del día anterior.
 */
export function lluviaEntreLecturas(antes: Lectura | null, despues: Lectura | null, totalAyer: number | null): number | null {
  if (!antes || !despues || antes.lluvia_dia === null || despues.lluvia_dia === null) return null;
  if (fechaLocal(antes.ts) === fechaLocal(despues.ts)) return Math.max(0, despues.lluvia_dia - antes.lluvia_dia);
  return despues.lluvia_dia + Math.max(0, (totalAyer ?? antes.lluvia_dia) - antes.lluvia_dia);
}

const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/** Todo lo de la página de la estación: tendencias, viento, acumulados, extremos y récords. */
app.get("/estaciones/:slug/completo", async (c) => {
  const db = c.env.DB;
  const f = c.get("estacion");
  const id = f.id;
  const t = ahora();
  const hoy = fechaLocal(t);
  const ayer = fechaAnterior(hoy);
  const margen = f.fuente === "aemet" ? 2400 : 600;
  const [actual, rHoy, rAyer, hace1h, hace3h, hace24h, vientoUltimaHora, vientoMediaHoy, desde] = await Promise.all([
    ultimaLectura(db, id),
    resumen(db, id, hoy),
    resumen(db, id, ayer),
    lecturaCerca(db, id, t - 3600, margen),
    lecturaCerca(db, id, t - 3 * 3600, margen),
    lecturaCerca(db, id, t - 86400, margen),
    vientoDesde(db, id, t - 3600),
    mediaVientoDesde(db, id, inicioDia(hoy)),
    primerDia(db, id),
  ]);
  const anio = hoy.slice(0, 4);
  const mes = hoy.slice(0, 7);
  const y = Number(anio);
  const m = Number(hoy.slice(5, 7));
  const [d7, lluviaMes, lluviaAnio, hidrologico, agricola, exMes, exAnio, records] = await Promise.all([
    lluviaEntre(db, id, fechaLocal(t - 6 * 86400), hoy),
    lluviaEntre(db, id, `${mes}-01`, hoy),
    lluviaEntre(db, id, `${anio}-01-01`, hoy),
    lluviaEntre(db, id, `${m >= 10 ? y : y - 1}-10-01`, hoy),
    lluviaEntre(db, id, `${m >= 9 ? y : y - 1}-09-01`, hoy),
    extremos(db, id, `${mes}-01`, hoy),
    extremos(db, id, `${anio}-01-01`, hoy),
    extremos(db, id, "0000-01-01", hoy),
  ]);
  const respuesta: RespuestaEstacion = {
    ahora: t,
    actual,
    hoy: rHoy,
    ayer: rAyer,
    hace1h,
    hace3h,
    hace24h,
    vientoUltimaHora,
    vientoMediaHoy,
    lluvia: {
      ultimaHora: r1(lluviaEntreLecturas(hace1h, actual, rAyer?.lluvia ?? null)),
      h24: r1(lluviaEntreLecturas(hace24h, actual, rAyer?.lluvia ?? null)),
      d7,
      mes: lluviaMes,
      anio: lluviaAnio,
      hidrologico,
      agricola,
    },
    mes: exMes,
    anio: exAnio,
    records,
    desde,
  };
  c.header("Cache-Control", "no-cache");
  return c.json(respuesta);
});

// ----- Embalses -----

app.get("/embalses", async (c) => {
  try {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(await estadoEmbalses(c.env, c.executionCtx));
  } catch (e) {
    console.error(e);
    return c.json({ error: "embalses no disponibles" }, 502);
  }
});

// ----- Ríos (aforos configurados en Administración) -----

const slugValido = (s: string) => /^[a-z0-9-]{1,80}$/.test(s);

app.get("/aforos", async (c) => {
  try {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(await estadoAforos(c.env));
  } catch (e) {
    console.error(e);
    return c.json({ error: "aforos no disponibles" }, 502);
  }
});

app.get("/aforos/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!slugValido(slug)) return c.json({ error: "aforo no válido" }, 400);
  const r = await detalleAforo(c.env, slug);
  if (!r) return c.json({ error: "aforo no encontrado" }, 404);
  c.header("Cache-Control", "public, max-age=300");
  return c.json(r);
});

app.get("/aforos/:slug/historico", async (c) => {
  const slug = c.req.param("slug");
  if (!slugValido(slug)) return c.json({ error: "aforo no válido" }, 400);
  const r = await resumenAforo(c.env, slug);
  if (!r) return c.json({ error: "aforo no encontrado" }, 404);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(r);
});

app.get("/aforos/:slug/anio/:anio", async (c) => {
  const anio = Number(c.req.param("anio"));
  if (!slugValido(c.req.param("slug")) || !Number.isInteger(anio) || anio < 1900 || anio > 2100) return c.json({ error: "petición no válida" }, 400);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(await anioAforo(c.env, c.req.param("slug"), anio));
});

app.get("/aforos/:slug/prevision", async (c) => {
  const slug = c.req.param("slug");
  if (!slugValido(slug)) return c.json({ error: "aforo no válido" }, 400);
  try {
    const r = await previsionAforo(c.env, c.executionCtx, slug);
    if (!r) return c.json({ error: "aforo no encontrado" }, 404);
    c.header("Cache-Control", "public, max-age=1800");
    return c.json(r);
  } catch (e) {
    console.error(e);
    return c.json({ error: "previsión no disponible" }, 502);
  }
});

app.get("/embalses/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return c.json({ error: "embalse no válido" }, 400);
  try {
    c.header("Cache-Control", "public, max-age=600");
    return c.json(await detalleEmbalse(slug, c.executionCtx));
  } catch (e) {
    console.error(e);
    return c.json({ error: "no encontrado" }, 404);
  }
});

// ----- Previsión, radar y satélite -----

app.get("/prevision", async (c) => {
  const q = c.req.query();
  const lugar = q.lat
    ? { lat: Number(q.lat), lon: Number(q.lon), altitud: Number(q.alt ?? 0) }
    : { lat: Number(c.env.RED_LAT), lon: Number(c.env.RED_LON), altitud: Number(c.env.RED_ALTITUD) };
  if (!(Math.abs(lugar.lat) <= 90 && Math.abs(lugar.lon) <= 180 && Number.isFinite(lugar.altitud))) {
    return c.json({ error: "lugar no válido" }, 400);
  }
  try {
    c.header("Cache-Control", "public, max-age=600");
    return c.json(await obtenerPrevision(lugar, c.executionCtx));
  } catch (e) {
    console.error(e);
    return c.json({ error: "previsión no disponible" }, 502);
  }
});

/** Altitud de un punto (para el alta de estaciones y ubicaciones). */
app.get("/elevacion", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lon = Number(c.req.query("lon"));
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return c.json({ error: "coordenadas no válidas" }, 400);
  const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
  if (!r.ok) return c.json({ error: "no disponible" }, 502);
  const j: { elevation?: number[] } = await r.json();
  c.header("Cache-Control", "public, max-age=86400");
  return c.json({ altitud: j.elevation?.[0] ?? null });
});

app.get("/radar", async (c) => {
  try {
    c.header("Cache-Control", "public, max-age=120");
    return c.json(await radar(c.env, c.executionCtx));
  } catch (e) {
    console.error(e);
    return c.json({ error: "radar no disponible" }, 502);
  }
});

app.get("/radar/tesela/:t/:z/:x/:y", async (c) => {
  const [t, z, x, y] = ["t", "z", "x", "y"].map((k) => Number(c.req.param(k)));
  if (![t, z, x, y].every(Number.isInteger)) return c.text("petición no válida", 400);
  const png = await teselaRadar(c.env, t, z, x, y);
  if (!png) return c.body(null, 404);
  return c.body(png, 200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable" });
});

app.get("/satelite", async (c) => {
  const tipo = (c.req.query("capa") ?? "color") as CapaSatelite;
  const horas = Number(c.req.query("horas") ?? 3);
  const hasta = c.req.query("hasta") ? Date.parse(c.req.query("hasta")!) : null;
  if (!(tipo in CAPAS_SATELITE) || !(horas in PASOS) || (hasta !== null && Number.isNaN(hasta))) {
    return c.json({ error: "parámetros no válidos" }, 400);
  }
  try {
    c.header("Cache-Control", "public, max-age=60");
    return c.json(await satelite(c.env, tipo, horas, hasta, c.executionCtx));
  } catch (e) {
    console.error(e);
    return c.json({ error: "satélite no disponible" }, 502);
  }
});

app.get("/satelite/imagen", async (c) => {
  const tipo = c.req.query("capa") as CapaSatelite;
  const t = c.req.query("t") ?? "";
  if (!(tipo in CAPAS_SATELITE) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/.test(t)) return c.text("petición no válida", 400);
  const imagen = await imagenSatelite(c.env, tipo, t);
  if (!imagen) return c.text("imagen no disponible", 502);
  return c.body(imagen, 200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400, immutable" });
});

export default app;
