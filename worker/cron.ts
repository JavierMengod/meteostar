// Tareas programadas: lectura de las estaciones por API y limpieza.
import { conector } from "./conectores";
import { descifrar } from "./cifrado";
import { guardarExtremosDia, guardarLectura, ultimaLectura } from "./db";
import type { FilaEstacion } from "./estaciones";
import { fechaLocal } from "./fechas";

/** Como mucho tantas estaciones por minuto (el plan gratuito permite 50 peticiones por invocación). */
const MAX_POR_MINUTO = 25;
/** El envío directo pasa a la reserva si la consola lleva este tiempo callada. */
const SILENCIO_DIRECTO = 150;

/** Lee una estación ahora mismo con su conector. Devuelve cuántas lecturas nuevas se han guardado. */
export async function leerEstacion(env: Env, f: FilaEstacion, ahora: number): Promise<number> {
  const con = conector(f.fuente);
  if (!con?.leer) throw new Error("Esta fuente no se consulta: es la estación la que envía los datos");
  const config = await descifrar(env, f.config);
  const resultado = await con.leer(config, env, ahora);
  // Las fuentes horarias (AEMET) traen las últimas 24 h; Meteoclimatic publica cada 10-20 min; las demás, solo valen si son recientes
  const antiguedad = f.fuente === "aemet" ? 86400 : f.fuente === "meteoclimatic" ? 3600 : f.fuente === "wunderground" ? 1800 : 900;
  let nuevas = 0;
  for (const l of resultado.lecturas) {
    if (ahora - l.ts > antiguedad || l.ts > ahora + 300) continue;
    if (await guardarLectura(env.DB, f.id, l)) nuevas++;
  }
  if (resultado.extremos) await guardarExtremosDia(env.DB, f.id, fechaLocal(ahora), resultado.extremos);
  return nuevas;
}

/** ¿Le toca leer a esta estación? */
async function toca(env: Env, f: FilaEstacion, ahora: number): Promise<boolean> {
  const con = conector(f.fuente);
  if (!con?.leer) return false;
  if (f.ultima_consulta && ahora - f.ultima_consulta < con.intervalo * 60 - 10) return false;
  if (f.fuente === "directo") {
    // Solo si tiene reserva configurada y la consola lleva un rato sin enviar
    if (!f.config) return false;
    const ultima = await ultimaLectura(env.DB, f.id);
    return !ultima || ahora - ultima.ts > SILENCIO_DIRECTO;
  }
  return true;
}

export async function leerEstaciones(env: Env, ahora: number) {
  const filas = (
    await env.DB.prepare("SELECT e.*, NULL AS propietario FROM estaciones e WHERE activa = 1 ORDER BY ultima_consulta IS NOT NULL, ultima_consulta").all<FilaEstacion>()
  ).results;
  const pendientes: FilaEstacion[] = [];
  for (const f of filas) {
    if (pendientes.length >= MAX_POR_MINUTO) break;
    if (await toca(env, f, ahora)) pendientes.push(f);
  }
  // De 6 en 6
  for (let i = 0; i < pendientes.length; i += 6) {
    await Promise.all(
      pendientes.slice(i, i + 6).map(async (f) => {
        let error: string | null = null;
        try {
          await leerEstacion(env, f, ahora);
        } catch (e) {
          error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
          console.error(`estación ${f.slug}:`, error);
        }
        await env.DB.prepare("UPDATE estaciones SET ultima_consulta = ?, ultimo_error = ? WHERE id = ?").bind(ahora, error, f.id).run();
      }),
    );
  }
}
