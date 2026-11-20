// Cuentas de usuario: contraseñas (PBKDF2), sesiones con cookie e invitaciones.
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Tema } from "../shared/temas";

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: "usuario" | "admin";
  tema: Tema;
}

// Vale para cualquier ruta de Hono que tenga el entorno del Worker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Contexto = Context<{ Bindings: Env; Variables: any }>;

const COOKIE = "meteostar_sesion";
const DURACION_SESION = 30 * 86400; // 30 días
const ITERACIONES = 100_000; // máximo que admite PBKDF2 en Workers

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Texto aleatorio seguro para URLs (claves, códigos de invitación, sesiones). */
export function aleatorio(bytes = 24): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
}

export async function hashContrasena(contrasena: string, sal?: string): Promise<{ hash: string; sal: string }> {
  const s = sal ?? b64(crypto.getRandomValues(new Uint8Array(16)));
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(contrasena), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: deB64(s), iterations: ITERACIONES }, clave, 256);
  return { hash: b64(bits), sal: s };
}

/** Comparación en tiempo constante. */
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function comprobarContrasena(contrasena: string, hash: string, sal: string): Promise<boolean> {
  const { hash: calculado } = await hashContrasena(contrasena, sal);
  return iguales(calculado, hash);
}

export function contrasenaValida(c: unknown): c is string {
  return typeof c === "string" && c.length >= 10 && c.length <= 200;
}

export function emailValido(e: unknown): e is string {
  return typeof e === "string" && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function crearSesion(c: Contexto, usuarioId: number) {
  const token = aleatorio(32);
  const caduca = Math.floor(Date.now() / 1000) + DURACION_SESION;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO sesiones (id, usuario_id, caduca) VALUES (?, ?, ?)").bind(await sha256(token), usuarioId, caduca),
    c.env.DB.prepare("UPDATE usuarios SET ultimo_acceso = unixepoch() WHERE id = ?").bind(usuarioId),
  ]);
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: DURACION_SESION,
  });
}

export async function cerrarSesion(c: Contexto) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sesiones WHERE id = ?").bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: "/" });
}

/** Identificador (guardado) de la sesión actual, o null. */
export async function sesionActual(c: Contexto): Promise<string | null> {
  const token = getCookie(c, COOKIE);
  return token ? sha256(token) : null;
}

/** Usuario de la sesión actual, o null (también si su cuenta está desactivada). */
export async function usuarioActual(c: Contexto): Promise<Usuario | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  return c.env.DB.prepare(
    `SELECT u.id, u.email, u.nombre, u.rol, u.tema FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.id = ? AND s.caduca > unixepoch() AND u.activo = 1`,
  )
    .bind(await sha256(token))
    .first<Usuario>();
}

// ----- Freno a los intentos de entrar a ciegas -----

/** Fallos seguidos con los que se bloquea un email, y durante cuánto */
const MAX_FALLOS = 10;
const VENTANA_FALLOS = 15 * 60;

/** Segundos que le quedan bloqueado a ese email (0 si puede intentarlo). */
export async function bloqueoAcceso(db: D1Database, email: string): Promise<number> {
  const hasta = await db.prepare("SELECT bloqueado_hasta FROM intentos_acceso WHERE email = ?").bind(email).first<number | null>("bloqueado_hasta");
  return Math.max(0, (hasta ?? 0) - Math.floor(Date.now() / 1000));
}

/** Apunta un fallo (y bloquea si ya van demasiados en poco tiempo). */
export async function apuntarFallo(db: D1Database, email: string) {
  await db
    .prepare(
      `INSERT INTO intentos_acceso (email, fallos, desde) VALUES (?1, 1, unixepoch())
       ON CONFLICT (email) DO UPDATE SET
         fallos = CASE WHEN desde < unixepoch() - ?2 THEN 1 ELSE fallos + 1 END,
         desde = CASE WHEN desde < unixepoch() - ?2 THEN unixepoch() ELSE desde END,
         bloqueado_hasta = CASE WHEN desde >= unixepoch() - ?2 AND fallos + 1 >= ?3 THEN unixepoch() + ?2 ELSE bloqueado_hasta END`,
    )
    .bind(email, VENTANA_FALLOS, MAX_FALLOS)
    .run();
}

/** Al entrar bien, se olvidan los fallos. */
export async function olvidarFallos(db: D1Database, email: string) {
  await db.prepare("DELETE FROM intentos_acceso WHERE email = ?").bind(email).run();
}
