// API de cuentas: acceso, invitaciones, mis estaciones, mis ubicaciones y administración.
import { Hono } from "hono";
import type { Invitacion, RespuestaCuenta, Ubicacion } from "../../shared/tipos";
import {
  aleatorio,
  cerrarSesion,
  comprobarContrasena,
  contrasenaValida,
  crearSesion,
  emailValido,
  hashContrasena,
  usuarioActual,
  type Usuario,
} from "../auth";
import { esTema } from "../../shared/temas";
import { infoConectores } from "../conectores";
import { catalogo } from "../embalses";
import { aforosConfigurados, anadirAforo, catalogoAforos, quitarAforo } from "../aforos";
import { calcularResumen } from "../historico-aforos";
import { leerEstacion } from "../cron";
import { ultimaLectura } from "../db";
import {
  actualizarEstacion,
  crearEstacion,
  estacionesDe,
  estacionPorId,
  propia,
  validarEstacion,
  type DatosEstacion,
  type FilaEstacion,
} from "../estaciones";
import { ahora } from "./publica";
import { anadirExterna, catalogoExternas, quitarExterna } from "../externas";
import { PROVINCIAS_MC } from "../meteoclimatic";

type Entorno = { Bindings: Env; Variables: { usuario: Usuario } };
const app = new Hono<Entorno>();

/** Cuerpo JSON de la petición (exigirlo también protege de envíos desde otras webs). */
async function cuerpo(c: { req: { header(n: string): string | undefined; json(): Promise<any> } }): Promise<Record<string, any> | null> {
  if (!c.req.header("content-type")?.includes("application/json")) return null;
  try {
    const j = await c.req.json();
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

const texto = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function crearUsuario(db: D1Database, nombre: string, email: string, contrasena: string, rol: "usuario" | "admin") {
  const { hash, sal } = await hashContrasena(contrasena);
  return db
    .prepare("INSERT INTO usuarios (email, nombre, hash, sal, rol, creado) VALUES (?, ?, ?, ?, ?, unixepoch()) RETURNING id")
    .bind(email, nombre, hash, sal, rol)
    .first<{ id: number }>();
}

function validarAlta(b: Record<string, any>): string | null {
  if (!texto(b.nombre)) return "Escribe tu nombre";
  if (!emailValido(b.email)) return "El email no es válido";
  if (!contrasenaValida(b.contrasena)) return "La contraseña debe tener al menos 10 caracteres";
  return null;
}

// ----- Acceso -----

app.get("/auth/estado", async (c) => {
  const u = await usuarioActual(c);
  const hay = await c.env.DB.prepare("SELECT 1 FROM usuarios LIMIT 1").first();
  let usuario = null;
  if (u) {
    const favs = (await c.env.DB.prepare("SELECT tipo, slug FROM favoritos WHERE usuario_id = ? ORDER BY creado").bind(u.id).all<{ tipo: string; slug: string }>()).results;
    usuario = {
      ...u,
      favoritos: {
        rios: favs.filter((f) => f.tipo === "rio").map((f) => f.slug),
        embalses: favs.filter((f) => f.tipo === "embalse").map((f) => f.slug),
        estaciones: favs.filter((f) => f.tipo === "estacion").map((f) => f.slug),
      },
    };
  }
  c.header("Cache-Control", "no-store");
  return c.json({ usuario, necesitaConfiguracion: !hay });
});

/** Primera cuenta (administrador). Solo funciona si no hay ningún usuario y con el código SETUP_TOKEN. */
app.post("/auth/primeros-pasos", async (c) => {
  const b = await cuerpo(c);
  if (!b) return c.json({ error: "Petición no válida" }, 400);
  if (await c.env.DB.prepare("SELECT 1 FROM usuarios LIMIT 1").first()) return c.json({ error: "Ya hay un administrador" }, 409);
  if (!c.env.SETUP_TOKEN || texto(b.codigo, 200) !== c.env.SETUP_TOKEN) {
    await esperar(800);
    return c.json({ error: "El código de configuración no es correcto" }, 403);
  }
  const error = validarAlta(b);
  if (error) return c.json({ error }, 400);
  const u = await crearUsuario(c.env.DB, texto(b.nombre), texto(b.email, 200), b.contrasena, "admin");
  // Las estaciones que había sin dueño (la de Villastar) pasan al administrador
  await c.env.DB.prepare("UPDATE estaciones SET usuario_id = ? WHERE usuario_id IS NULL").bind(u!.id).run();
  await crearSesion(c, u!.id);
  return c.json({ ok: true });
});

app.get("/auth/invitacion/:codigo", async (c) => {
  const inv = await c.env.DB.prepare("SELECT email FROM invitaciones WHERE codigo = ? AND usada IS NULL AND caduca > unixepoch()")
    .bind(c.req.param("codigo"))
    .first<{ email: string | null }>();
  return c.json(inv ? { valida: true, email: inv.email } : { valida: false });
});

app.post("/auth/registro", async (c) => {
  const b = await cuerpo(c);
  if (!b) return c.json({ error: "Petición no válida" }, 400);
  const error = validarAlta(b);
  if (error) return c.json({ error }, 400);
  const email = texto(b.email, 200);
  const inv = await c.env.DB.prepare("SELECT codigo, email FROM invitaciones WHERE codigo = ? AND usada IS NULL AND caduca > unixepoch()")
    .bind(texto(b.codigo, 100))
    .first<{ codigo: string; email: string | null }>();
  if (!inv) return c.json({ error: "La invitación no es válida o ha caducado" }, 403);
  if (inv.email && inv.email.toLowerCase() !== email.toLowerCase()) return c.json({ error: "Esta invitación es para otro email" }, 403);
  if (await c.env.DB.prepare("SELECT 1 FROM usuarios WHERE email = ?").bind(email).first()) {
    return c.json({ error: "Ya hay una cuenta con ese email" }, 409);
  }
  const u = await crearUsuario(c.env.DB, texto(b.nombre), email, b.contrasena, "usuario");
  // Marcar la invitación como usada (solo si nadie la ha usado mientras tanto)
  await c.env.DB.prepare("UPDATE invitaciones SET usada = unixepoch(), usada_por = ? WHERE codigo = ? AND usada IS NULL")
    .bind(u!.id, inv.codigo)
    .run();
  await crearSesion(c, u!.id);
  return c.json({ ok: true });
});

app.post("/auth/entrar", async (c) => {
  const b = await cuerpo(c);
  if (!b) return c.json({ error: "Petición no válida" }, 400);
  const fila = await c.env.DB.prepare("SELECT id, hash, sal FROM usuarios WHERE email = ?")
    .bind(texto(b.email, 200))
    .first<{ id: number; hash: string; sal: string }>();
  const ok = fila && typeof b.contrasena === "string" && (await comprobarContrasena(b.contrasena, fila.hash, fila.sal));
  if (!ok) {
    await esperar(800); // frena los intentos a ciegas
    return c.json({ error: "Email o contraseña incorrectos" }, 401);
  }
  await crearSesion(c, fila.id);
  return c.json({ ok: true });
});

app.post("/auth/salir", async (c) => {
  await cerrarSesion(c);
  return c.json({ ok: true });
});

app.get("/conectores", (c) => c.json(infoConectores()));

// ----- A partir de aquí, hace falta haber entrado -----

app.use("/cuenta/*", async (c, next) => {
  const u = await usuarioActual(c);
  if (!u) return c.json({ error: "Tienes que entrar en tu cuenta" }, 401);
  c.set("usuario", u);
  c.header("Cache-Control", "no-store");
  await next();
});
app.use("/cuenta", async (c, next) => {
  const u = await usuarioActual(c);
  if (!u) return c.json({ error: "Tienes que entrar en tu cuenta" }, 401);
  c.set("usuario", u);
  c.header("Cache-Control", "no-store");
  await next();
});
app.use("/admin/*", async (c, next) => {
  const u = await usuarioActual(c);
  if (!u || u.rol !== "admin") return c.json({ error: "Solo para el administrador" }, 403);
  c.set("usuario", u);
  c.header("Cache-Control", "no-store");
  await next();
});

async function vistaPropia(env: Env, f: FilaEstacion) {
  return propia(env, f, (await ultimaLectura(env.DB, f.id))?.ts ?? null);
}

app.get("/cuenta", async (c) => {
  const u = c.get("usuario");
  const filas = await estacionesDe(c.env.DB, u.id, false);
  const ubicaciones = await c.env.DB.prepare("SELECT id, nombre, lat, lon, altitud FROM ubicaciones WHERE usuario_id = ? ORDER BY nombre")
    .bind(u.id)
    .all<Ubicacion>();
  const respuesta: RespuestaCuenta = {
    usuario: u,
    estaciones: await Promise.all(filas.map((f) => vistaPropia(c.env, f))),
    ubicaciones: ubicaciones.results,
  };
  return c.json(respuesta);
});

app.put("/cuenta/perfil", async (c) => {
  const b = await cuerpo(c);
  const nombre = texto(b?.nombre);
  if (!nombre) return c.json({ error: "Escribe tu nombre" }, 400);
  await c.env.DB.prepare("UPDATE usuarios SET nombre = ? WHERE id = ?").bind(nombre, c.get("usuario").id).run();
  return c.json({ ok: true });
});

app.put("/cuenta/tema", async (c) => {
  const tema = (await cuerpo(c))?.tema;
  if (!esTema(tema)) return c.json({ error: "Tema no válido" }, 400);
  await c.env.DB.prepare("UPDATE usuarios SET tema = ? WHERE id = ?").bind(tema, c.get("usuario").id).run();
  return c.json({ ok: true });
});

app.put("/cuenta/contrasena", async (c) => {
  const b = await cuerpo(c);
  const u = c.get("usuario");
  const fila = await c.env.DB.prepare("SELECT hash, sal FROM usuarios WHERE id = ?").bind(u.id).first<{ hash: string; sal: string }>();
  if (!b || typeof b.actual !== "string" || !(await comprobarContrasena(b.actual, fila!.hash, fila!.sal))) {
    await esperar(800);
    return c.json({ error: "La contraseña actual no es correcta" }, 403);
  }
  if (!contrasenaValida(b.nueva)) return c.json({ error: "La nueva contraseña debe tener al menos 10 caracteres" }, 400);
  const { hash, sal } = await hashContrasena(b.nueva);
  await c.env.DB.prepare("UPDATE usuarios SET hash = ?, sal = ? WHERE id = ?").bind(hash, sal, u.id).run();
  // Cierra las demás sesiones
  await c.env.DB.prepare("DELETE FROM sesiones WHERE usuario_id = ?").bind(u.id).run();
  await crearSesion(c, u.id);
  return c.json({ ok: true });
});

// ----- Mis estaciones -----

/** La estación, si el usuario puede tocarla (su dueño o el administrador). */
async function estacionEditable(c: { env: Env; get(k: "usuario"): Usuario }, id: number): Promise<FilaEstacion | null> {
  const f = await estacionPorId(c.env.DB, id);
  const u = c.get("usuario");
  if (!f || (f.usuario_id !== u.id && u.rol !== "admin")) return null;
  return f;
}

app.post("/cuenta/estaciones", async (c) => {
  const b = await cuerpo(c);
  if (!b) return c.json({ error: "Petición no válida" }, 400);
  const u = c.get("usuario");
  const v = await validarEstacion(c.env, b as DatosEstacion, u.rol === "admin");
  if ("error" in v) return c.json(v, 400);
  const id = await crearEstacion(c.env.DB, u.id, v.valores);
  return c.json(await vistaPropia(c.env, (await estacionPorId(c.env.DB, id))!));
});

app.put("/cuenta/estaciones/:id", async (c) => {
  const f = await estacionEditable(c, Number(c.req.param("id")));
  if (!f) return c.json({ error: "Estación no encontrada" }, 404);
  const b = await cuerpo(c);
  if (!b) return c.json({ error: "Petición no válida" }, 400);
  const v = await validarEstacion(c.env, b as DatosEstacion, c.get("usuario").rol === "admin", f);
  if ("error" in v) return c.json(v, 400);
  await actualizarEstacion(c.env.DB, f, v.valores);
  return c.json(await vistaPropia(c.env, (await estacionPorId(c.env.DB, f.id))!));
});

app.delete("/cuenta/estaciones/:id", async (c) => {
  const f = await estacionEditable(c, Number(c.req.param("id")));
  if (!f) return c.json({ error: "Estación no encontrada" }, 404);
  // Borra también sus lecturas y resúmenes
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM lecturas WHERE estacion_id = ?").bind(f.id),
    c.env.DB.prepare("DELETE FROM resumen_diario WHERE estacion_id = ?").bind(f.id),
    c.env.DB.prepare("DELETE FROM estaciones WHERE id = ?").bind(f.id),
  ]);
  return c.json({ ok: true });
});

/** Nueva clave de envío (la anterior deja de funcionar). */
app.post("/cuenta/estaciones/:id/token", async (c) => {
  const f = await estacionEditable(c, Number(c.req.param("id")));
  if (!f || f.fuente !== "directo") return c.json({ error: "Estación no encontrada" }, 404);
  await c.env.DB.prepare("UPDATE estaciones SET token = ? WHERE id = ?").bind(aleatorio(18), f.id).run();
  return c.json(await vistaPropia(c.env, (await estacionPorId(c.env.DB, f.id))!));
});

/** Lee la estación ahora mismo para comprobar que la configuración funciona. */
app.post("/cuenta/estaciones/:id/probar", async (c) => {
  const f = await estacionEditable(c, Number(c.req.param("id")));
  if (!f) return c.json({ error: "Estación no encontrada" }, 404);
  const t = ahora();
  try {
    const nuevas = await leerEstacion(c.env, f, t);
    await c.env.DB.prepare("UPDATE estaciones SET ultima_consulta = ?, ultimo_error = NULL WHERE id = ?").bind(t, f.id).run();
    return c.json({ ok: true, nuevas, ultima: await ultimaLectura(c.env.DB, f.id) });
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await c.env.DB.prepare("UPDATE estaciones SET ultima_consulta = ?, ultimo_error = ? WHERE id = ?").bind(t, error, f.id).run();
    return c.json({ ok: false, error });
  }
});

// ----- Mis ubicaciones (lugares para la previsión) -----

function validarUbicacion(b: Record<string, any> | null) {
  const nombre = texto(b?.nombre, 60);
  const lat = Number(b?.lat);
  const lon = Number(b?.lon);
  const altitud = Number(b?.altitud);
  if (!nombre) return { error: "Escribe un nombre para el lugar" };
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return { error: "Las coordenadas no son válidas" };
  if (!(altitud > -500 && altitud < 9000)) return { error: "La altitud no es válida" };
  return { nombre, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, altitud: Math.round(altitud) };
}

app.post("/cuenta/ubicaciones", async (c) => {
  const v = validarUbicacion(await cuerpo(c));
  if ("error" in v) return c.json(v, 400);
  const n = await c.env.DB.prepare("SELECT count(*) AS n FROM ubicaciones WHERE usuario_id = ?").bind(c.get("usuario").id).first<number>("n");
  if ((n ?? 0) >= 50) return c.json({ error: "Como mucho 50 lugares" }, 400);
  const r = await c.env.DB.prepare("INSERT INTO ubicaciones (usuario_id, nombre, lat, lon, altitud, creada) VALUES (?, ?, ?, ?, ?, unixepoch()) RETURNING id")
    .bind(c.get("usuario").id, v.nombre, v.lat, v.lon, v.altitud)
    .first<{ id: number }>();
  return c.json({ id: r!.id, ...v });
});

app.put("/cuenta/ubicaciones/:id", async (c) => {
  const v = validarUbicacion(await cuerpo(c));
  if ("error" in v) return c.json(v, 400);
  const r = await c.env.DB.prepare("UPDATE ubicaciones SET nombre = ?, lat = ?, lon = ?, altitud = ? WHERE id = ? AND usuario_id = ?")
    .bind(v.nombre, v.lat, v.lon, v.altitud, Number(c.req.param("id")), c.get("usuario").id)
    .run();
  if (!r.meta.changes) return c.json({ error: "Lugar no encontrado" }, 404);
  return c.json({ id: Number(c.req.param("id")), ...v });
});

app.delete("/cuenta/ubicaciones/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM ubicaciones WHERE id = ? AND usuario_id = ?").bind(Number(c.req.param("id")), c.get("usuario").id).run();
  return c.json({ ok: true });
});

// ----- Administración -----

app.get("/admin/resumen", async (c) => {
  const db = c.env.DB;
  const usuarios = await db
    .prepare(
      `SELECT u.id, u.nombre, u.email, u.rol, u.creado, (SELECT count(*) FROM estaciones e WHERE e.usuario_id = u.id) AS estaciones
       FROM usuarios u ORDER BY u.creado`,
    )
    .all();
  const invitaciones = await db
    .prepare(
      `SELECT i.codigo, i.email, i.nota, i.creada, i.caduca, i.usada, u.nombre AS usada_por_nombre
       FROM invitaciones i LEFT JOIN usuarios u ON u.id = i.usada_por ORDER BY i.creada DESC LIMIT 100`,
    )
    .all<Invitacion>();
  const filas = await estacionesDe(db, 0, true);
  return c.json({
    usuarios: usuarios.results,
    invitaciones: invitaciones.results,
    estaciones: await Promise.all(filas.map((f) => vistaPropia(c.env, f))),
  });
});

app.post("/admin/invitaciones", async (c) => {
  const b = (await cuerpo(c)) ?? {};
  const email = texto(b.email, 200);
  if (email && !emailValido(email)) return c.json({ error: "El email no es válido" }, 400);
  const dias = Math.min(Math.max(Number(b.dias) || 14, 1), 90);
  const codigo = aleatorio(18);
  await c.env.DB.prepare("INSERT INTO invitaciones (codigo, email, nota, creada, creada_por, caduca) VALUES (?, ?, ?, unixepoch(), ?, unixepoch() + ?)")
    .bind(codigo, email || null, texto(b.nota, 120) || null, c.get("usuario").id, dias * 86400)
    .run();
  return c.json({ codigo });
});

app.delete("/admin/invitaciones/:codigo", async (c) => {
  await c.env.DB.prepare("DELETE FROM invitaciones WHERE codigo = ? AND usada IS NULL").bind(c.req.param("codigo")).run();
  return c.json({ ok: true });
});

// ----- Estaciones de otras redes (Meteoclimatic), desde el mapa -----

app.get("/admin/externas/provincias", (c) => c.json(PROVINCIAS_MC));

app.get("/admin/externas/catalogo", async (c) => {
  const region = c.req.query("provincia") ?? "ESARA44";
  if (!PROVINCIAS_MC[region]) return c.json({ error: "Provincia no válida" }, 400);
  try {
    return c.json(await catalogoExternas(c.env.DB, region));
  } catch (e) {
    console.error(e);
    return c.json({ error: "No se ha podido leer Meteoclimatic" }, 502);
  }
});

app.post("/admin/externas", async (c) => {
  const codigo = texto((await cuerpo(c))?.codigo, 30).toUpperCase();
  const r = await anadirExterna(c.env, c.get("usuario").id, codigo);
  return "error" in r ? c.json(r, 400) : c.json(r);
});

app.delete("/admin/externas/:codigo", async (c) => {
  const ok = await quitarExterna(c.env.DB, c.req.param("codigo").toUpperCase());
  return ok ? c.json({ ok: true }) : c.json({ error: "No está en Meteostar" }, 404);
});

// ----- Embalses que se muestran -----

app.get("/admin/embalses/catalogo", async (c) => {
  try {
    return c.json(await catalogo(c.env, c.executionCtx));
  } catch (e) {
    console.error(e);
    return c.json({ error: "No se ha podido leer el catálogo de embalses" }, 502);
  }
});

app.post("/admin/embalses", async (c) => {
  const slug = texto((await cuerpo(c))?.slug, 80);
  if (!/^[a-z0-9-]+$/.test(slug)) return c.json({ error: "Embalse no válido" }, 400);
  const n = (await c.env.DB.prepare("SELECT count(*) AS n FROM embalses").first<number>("n")) ?? 0;
  if (n >= 20) return c.json({ error: "Como mucho 20 embalses" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO embalses (slug, orden, creado) VALUES (?, (SELECT coalesce(max(orden), 0) + 1 FROM embalses), unixepoch())")
    .bind(slug)
    .run();
  return c.json({ ok: true });
});

app.delete("/admin/embalses/:slug", async (c) => {
  await c.env.DB.prepare("DELETE FROM embalses WHERE slug = ?").bind(c.req.param("slug")).run();
  return c.json({ ok: true });
});

/** Nuevo orden: lista de slugs. */
app.put("/admin/embalses/orden", async (c) => {
  const lista = (await cuerpo(c))?.slugs;
  if (!Array.isArray(lista)) return c.json({ error: "Petición no válida" }, 400);
  await c.env.DB.batch(lista.slice(0, 20).map((slug: unknown, i: number) => c.env.DB.prepare("UPDATE embalses SET orden = ? WHERE slug = ?").bind(i + 1, String(slug))));
  return c.json({ ok: true });
});

// ----- Ríos, embalses y estaciones que sigue el usuario -----

/** Marca o desmarca un río, un embalse o una estación como seguido. */
app.put("/cuenta/favoritos", async (c) => {
  const u = c.get("usuario");
  const b = await cuerpo(c);
  const tipo = b?.tipo === "rio" || b?.tipo === "embalse" || b?.tipo === "estacion" ? b.tipo : null;
  const slug = texto(b?.slug, 80);
  if (!tipo || !/^[a-z0-9-]+$/.test(slug)) return c.json({ error: "Petición no válida" }, 400);
  if (b?.seguir) {
    const consulta =
      tipo === "rio"
        ? "SELECT 1 FROM aforos WHERE slug = ?"
        : tipo === "embalse"
          ? "SELECT 1 FROM embalses WHERE slug = ?"
          : "SELECT 1 FROM estaciones WHERE slug = ? AND publica = 1 AND activa = 1";
    if (!(await c.env.DB.prepare(consulta).bind(slug).first())) return c.json({ error: "No existe" }, 404);
    await c.env.DB.prepare("INSERT OR IGNORE INTO favoritos (usuario_id, tipo, slug, creado) VALUES (?, ?, ?, unixepoch())").bind(u.id, tipo, slug).run();
  } else {
    await c.env.DB.prepare("DELETE FROM favoritos WHERE usuario_id = ? AND tipo = ? AND slug = ?").bind(u.id, tipo, slug).run();
  }
  return c.json({ ok: true });
});

// ----- Ríos (aforos) que se muestran -----

app.get("/admin/aforos/catalogo", async (c) => {
  try {
    return c.json(await catalogoAforos(c.env, c.executionCtx));
  } catch (e) {
    console.error(e);
    return c.json({ error: "No se ha podido leer el catálogo del Observatorio del Agua" }, 502);
  }
});

const anioRegulado = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1850 && n <= 2100 ? n : null;
};

app.post("/admin/aforos", async (c) => {
  const b = await cuerpo(c);
  const elemento = texto(b?.elemento, 80);
  const nombre = texto(b?.nombre, 80);
  const rio = texto(b?.rio, 60);
  const embalse = texto(b?.embalse, 80) || null;
  if (!elemento || !nombre || !rio) return c.json({ error: "Faltan el aforo, el nombre o el río" }, 400);
  if (embalse && !/^[a-z0-9-]+$/.test(embalse)) return c.json({ error: "Embalse no válido" }, 400);
  if ((await aforosConfigurados(c.env.DB)).length >= 300) return c.json({ error: "Como mucho 300 ríos" }, 400);
  const r = await anadirAforo(c.env, c.executionCtx, { elemento, nombre, rio, embalse, reguladoDesde: anioRegulado(b?.reguladoDesde) });
  return "error" in r ? c.json(r, 400) : c.json(r);
});

app.put("/admin/aforos/:slug", async (c) => {
  const b = await cuerpo(c);
  const nombre = texto(b?.nombre, 80);
  const rio = texto(b?.rio, 60);
  const embalse = texto(b?.embalse, 80) || null;
  if (!nombre || !rio) return c.json({ error: "Faltan el nombre o el río" }, 400);
  if (embalse && !/^[a-z0-9-]+$/.test(embalse)) return c.json({ error: "Embalse no válido" }, 400);
  await c.env.DB.prepare("UPDATE aforos SET nombre = ?, rio = ?, embalse = ?, regulado_desde = ? WHERE slug = ?")
    .bind(nombre, rio, embalse, anioRegulado(b?.reguladoDesde), c.req.param("slug"))
    .run();
  // Los récords dependen del año de regulación: se recalcula el resumen
  const a = (await aforosConfigurados(c.env.DB)).find((x) => x.slug === c.req.param("slug"));
  if (a) c.executionCtx.waitUntil(calcularResumen(c.env.DB, a).catch((e) => console.error(e)));
  return c.json({ ok: true });
});

app.delete("/admin/aforos/:slug", async (c) => {
  await quitarAforo(c.env.DB, c.req.param("slug"));
  return c.json({ ok: true });
});

/** Nuevo orden: lista de slugs. */
app.put("/admin/aforos-orden", async (c) => {
  const lista = (await cuerpo(c))?.slugs;
  if (!Array.isArray(lista)) return c.json({ error: "Petición no válida" }, 400);
  await c.env.DB.batch(lista.slice(0, 300).map((slug: unknown, i: number) => c.env.DB.prepare("UPDATE aforos SET orden = ? WHERE slug = ?").bind(i + 1, String(slug))));
  return c.json({ ok: true });
});

/** Lo que se ve por defecto (sin cuenta): marca o desmarca un río, un embalse o una estación. */
app.put("/admin/por-defecto", async (c) => {
  const b = await cuerpo(c);
  const tabla = b?.tipo === "rio" ? "aforos" : b?.tipo === "embalse" ? "embalses" : b?.tipo === "estacion" ? "estaciones" : null;
  const slug = texto(b?.slug, 80);
  if (!tabla || !/^[a-z0-9-]+$/.test(slug)) return c.json({ error: "Petición no válida" }, 400);
  await c.env.DB.prepare(`UPDATE ${tabla} SET destacado = ? WHERE slug = ?`).bind(b?.destacado ? 1 : 0, slug).run();
  return c.json({ ok: true });
});

export default app;
