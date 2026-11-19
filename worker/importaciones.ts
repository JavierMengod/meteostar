// Importación de históricos de otras redes: una cola común para todas las estaciones y todas las redes.
//  - Cada estación tiene como mucho una importación (tabla «importaciones»), que se trae hacia atrás desde hoy: lo más
//    reciente llega primero.
//  - En cada pasada (cada 10 minutos, en su propia tarea programada) cada red tiene un cupo de peticiones, que se
//    reparte por turnos entre sus estaciones pendientes (la que lleva más tiempo sin atender, primero). Así una estación
//    con 40 años de datos no frena a las demás, y con muchas estaciones todas avanzan a la vez.
//  - Si la red pide una pausa (límite por minuto o cupo diario), esa red se para hasta la siguiente pasada. Si una
//    estación falla varias veces seguidas, espera unas horas antes de reintentarlo.
import type { EstadoImportacion } from "../shared/tipos";
import { diaClimatologico, pedirAemet } from "./aemet";
import { diaWU, guardarDias } from "./historico-dias";
import { estacionPorId, type FilaEstacion } from "./estaciones";
import { clavesEcowitt, importarDia } from "./importar-ecowitt";
import { pedirWU } from "./wunderground";

/** La red pide esperar (límite por minuto, cupo del día…): se sigue en la siguiente pasada. */
export class Pausa extends Error {}

const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const hoyUTC = () => new Date().toISOString().slice(0, 10);

interface Importacion {
  estacion_id: number;
  red: string;
  codigo: string;
  cursor: string;
  limite: string | null;
  dias: number;
  vacios: number;
  fallos: number;
}

/** Resultado de una petición: días con datos, peticiones seguidas sin datos y dónde seguir (null = ya no hay más). */
interface Paso {
  dias: number;
  vacios: number;
  siguiente: string | null;
}

interface Red {
  nombre: string;
  /** Peticiones por pasada de 10 minutos, repartidas entre todas sus estaciones pendientes */
  porPasada: number;
  paso(env: Env, imp: Importacion, est: FilaEstacion): Promise<Paso>;
}

/** Weather Underground: tope de peticiones del día para históricos (la clave la comparte el resto de la web) */
const CUPO_HISTORICO_WU = 1000;

export type ClaveRed = "aemet" | "wunderground" | "ecowitt";

const REDES: Record<ClaveRed, Red> = {
  // AEMET: valores climatológicos diarios, 6 meses por petición. Se acaba tras un año seguido sin datos.
  aemet: {
    nombre: "AEMET",
    porPasada: 3,
    async paso(env, imp, est) {
      const fin = imp.cursor;
      const ini = sumarDias(fin, -179);
      let dias: any[] = [];
      try {
        dias = await pedirAemet(
          env,
          `/valores/climatologicos/diarios/datos/fechaini/${ini}T00:00:00UTC/fechafin/${fin}T23:59:59UTC/estacion/${encodeURIComponent(imp.codigo)}`,
        );
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        if (/l.mite/i.test(msg)) throw new Pausa(msg);
        if (!/no hay datos/i.test(msg)) throw e;
      }
      const filas = (Array.isArray(dias) ? dias : []).map((o) => diaClimatologico(o, est.altitud)).filter((d) => d.tmax !== null || d.lluvia !== null);
      if (filas.length) await guardarDias(env.DB, est.id, "aemet", filas);
      const vacios = filas.length ? 0 : imp.vacios + 1;
      return { dias: filas.length, vacios, siguiente: vacios >= 2 || ini <= "1920-01-01" ? null : sumarDias(ini, -1) };
    },
  },
  // Weather Underground: un día por petición. Se acaba tras dos meses seguidos sin datos (la estación aún no existía).
  wunderground: {
    nombre: "Weather Underground",
    porPasada: 6,
    async paso(env, imp, est) {
      const dia = imp.cursor;
      let r: Response;
      try {
        r = await pedirWU(
          env,
          `https://api.weather.com/v2/pws/history/daily?stationId=${encodeURIComponent(imp.codigo)}&date=${dia.replaceAll("-", "")}&format=json&units=m&numericPrecision=decimal`,
          CUPO_HISTORICO_WU,
        );
      } catch (e) {
        throw new Pausa(String(e instanceof Error ? e.message : e)); // sin cupo del día (o sin clave)
      }
      if (r.status === 429) throw new Pausa("Weather Underground pide una pausa");
      if (r.status !== 204 && !r.ok) throw new Error(`Weather Underground: HTTP ${r.status}`);
      const o = r.status === 204 ? null : ((await r.json()) as any)?.observations?.[0];
      const d = diaWU(dia, o);
      const conDatos = d ? 1 : 0;
      if (d) await guardarDias(env.DB, est.id, "wu", [d]);
      const vacios = conDatos ? 0 : imp.vacios + 1;
      return { dias: conDatos, vacios, siguiente: vacios >= 60 || dia <= "2000-01-01" ? null : sumarDias(dia, -1) };
    },
  },
  // ecowitt.net: un día por petición, con las claves de la propia estación, hasta el día en que se dio de alta allí.
  ecowitt: {
    nombre: "ecowitt.net",
    porPasada: 4,
    async paso(env, imp, est) {
      const dia = imp.cursor;
      let n: number;
      try {
        n = await importarDia(env, est, await clavesEcowitt(env, est), dia, Math.floor(Date.now() / 1000));
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        if (/limit/i.test(msg)) throw new Pausa(msg);
        throw e;
      }
      const vacios = n ? 0 : imp.vacios + 1;
      const fin = imp.limite ? dia <= imp.limite : vacios >= 60;
      return { dias: n ? 1 : 0, vacios, siguiente: fin || dia <= "2000-01-01" ? null : sumarDias(dia, -1) };
    },
  },
};

export const nombreRed = (red: string) => REDES[red as ClaveRed]?.nombre ?? red;

/**
 * Pone a la cola la importación de una estación (si ya tenía una, la reemplaza y empieza de nuevo).
 * «desde»: primer día a pedir (por defecto, hoy); «limite»: el más antiguo que tiene la red, si se sabe.
 */
export async function encolarImportacion(db: D1Database, estacionId: number, red: ClaveRed, codigo = "", desde = hoyUTC(), limite: string | null = null) {
  await db
    .prepare(
      `INSERT INTO importaciones (estacion_id, red, codigo, cursor, limite, inicio) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (estacion_id) DO UPDATE SET red = excluded.red, codigo = excluded.codigo, cursor = excluded.cursor,
         limite = excluded.limite, inicio = excluded.inicio, dias = 0, vacios = 0, fallos = 0, error = NULL, turno = 0,
         creada = unixepoch()`,
    )
    .bind(estacionId, red, codigo, desde, limite, desde)
    .run();
}

/**
 * Una pasada: el cupo de cada red, repartido por turnos entre sus estaciones pendientes (una petición a cada una, y
 * otra vuelta mientras quede cupo). Con «soloEstacion», solo esa (p. ej. justo al darla de alta, para que tenga datos
 * al momento) y con «pasos» peticiones como mucho.
 */
export async function avanzarImportaciones(env: Env, soloEstacion?: number, pasos?: number): Promise<number> {
  const db = env.DB;
  const ahora = Math.floor(Date.now() / 1000);
  let hechos = 0;
  for (const [clave, red] of Object.entries(REDES)) {
    const cola = (
      await db
        .prepare(
          `SELECT estacion_id, red, codigo, cursor, limite, dias, vacios, fallos FROM importaciones
           WHERE red = ? AND cursor IS NOT NULL AND turno <= ? ${soloEstacion ? "AND estacion_id = ?" : ""}
           ORDER BY turno LIMIT ?`,
        )
        .bind(clave, ahora, ...(soloEstacion ? [soloEstacion] : []), red.porPasada)
        .all<Importacion>()
    ).results;
    let cupo = pasos ?? red.porPasada;
    const estaciones = new Map<number, FilaEstacion | null>();
    while (cupo > 0 && cola.length) {
      for (const imp of [...cola]) {
        if (cupo <= 0) break;
        if (!estaciones.has(imp.estacion_id)) estaciones.set(imp.estacion_id, await estacionPorId(db, imp.estacion_id));
        const est = estaciones.get(imp.estacion_id);
        if (!est) {
          await db.prepare("DELETE FROM importaciones WHERE estacion_id = ?").bind(imp.estacion_id).run();
          cola.splice(cola.indexOf(imp), 1);
          continue;
        }
        cupo--;
        let r: Paso;
        try {
          r = await red.paso(env, imp, est);
        } catch (e) {
          if (e instanceof Pausa) {
            cupo = 0; // esta red, hasta la siguiente pasada
            break;
          }
          // Fallo de esta estación: se reintenta en otra pasada; tras 5 seguidos, espera 6 horas
          const fallos = imp.fallos + 1;
          const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
          console.error("importación", clave, imp.estacion_id, imp.cursor, msg);
          await db
            .prepare("UPDATE importaciones SET fallos = ?, error = ?, turno = ? WHERE estacion_id = ?")
            .bind(fallos, msg, fallos >= 5 ? ahora + 6 * 3600 : ahora, imp.estacion_id)
            .run();
          cola.splice(cola.indexOf(imp), 1);
          continue;
        }
        hechos++;
        imp.dias += r.dias;
        imp.vacios = r.vacios;
        imp.fallos = 0;
        await db
          .prepare("UPDATE importaciones SET cursor = ?, dias = ?, vacios = ?, fallos = 0, error = NULL, turno = ? WHERE estacion_id = ?")
          .bind(r.siguiente, imp.dias, r.vacios, ahora, imp.estacion_id)
          .run();
        if (r.siguiente) imp.cursor = r.siguiente;
        else cola.splice(cola.indexOf(imp), 1);
      }
    }
  }
  return hechos;
}

/** Estado de la importación de una estación (para su página y para el editor). */
export async function estadoImportacion(db: D1Database, estacionId: number): Promise<EstadoImportacion | null> {
  const f = await db
    .prepare("SELECT red, cursor, limite, inicio, dias, fallos, error FROM importaciones WHERE estacion_id = ?")
    .bind(estacionId)
    .first<{ red: string; cursor: string | null; limite: string | null; inicio: string; dias: number; fallos: number; error: string | null }>();
  if (!f) return null;
  // Con el día más antiguo conocido (ecowitt.net) se puede dar el porcentaje
  const dia = 86400000;
  const total = f.limite ? (Date.parse(f.inicio) - Date.parse(f.limite)) / dia + 1 : null;
  const recorridos = f.cursor ? (Date.parse(f.inicio) - Date.parse(f.cursor)) / dia : total;
  return {
    red: nombreRed(f.red),
    terminada: f.cursor === null,
    porDia: f.cursor,
    dias: f.dias,
    porcentaje: total && recorridos !== null ? Math.max(0, Math.min(100, Math.round((recorridos / total) * 100))) : null,
    error: f.fallos ? f.error : null,
  };
}
