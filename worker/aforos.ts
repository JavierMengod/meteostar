// Aforos de río medidos: Observatorio del Agua GOTA del MITECO (https://observatorioagua.miteco.es/hidrologia/),
// que publica los datos de los SAIH de las confederaciones. Reutilización permitida citando la fuente
// (aviso legal del MITECO, Ley 37/2007). Son datos en tiempo real, provisionales y sin validar.
// El servicio da como mucho 7 días de una vez: cada 10 minutos se guardan las lecturas nuevas en D1.
import type { Aforo, RespuestaAforos } from "../shared/tipos";

const API = "https://observatorioagua.miteco.es/api/Historical/chart/product";
const AGENTE = "Meteostar/1.0 (web meteorologica sin animo de lucro)";
const PRODUCTO = {
  caudal: "01928f80-65ec-75e6-bddc-6daa2b7c51f1",
  nivel: "01928f80-65ec-7479-95cb-288f07921f44",
};

export interface DefAforo {
  id: string;
  nombre: string;
  rio: string;
  codigo: string;
  /** Identificador del elemento en el Observatorio */
  elemento: string;
}

export const AFOROS: DefAforo[] = [
  { id: "turia-teruel", nombre: "Turia en Teruel", rio: "Turia", codigo: "08015", elemento: "01961577-5958-7eda-a917-32b3c145c9c6" },
  { id: "alfambra-teruel", nombre: "Alfambra en Teruel", rio: "Alfambra", codigo: "08027", elemento: "01961577-5988-78d8-adea-7fb39f1a6f9f" },
];

/** Días que se muestran en la web */
const DIAS = 30;

export interface Serie {
  puntos: [number, number][];
  /** Umbrales de aviso de la confederación (m³/s), de menor a mayor */
  umbrales: number[];
}

/** Convierte la respuesta del Observatorio en pares [segundos, valor]. */
export function adaptarSerie(j: any): Serie {
  const fechas: unknown[] = Array.isArray(j?.dates) ? j.dates : [];
  const valores: unknown[] = Array.isArray(j?.values) ? j.values : [];
  const puntos: [number, number][] = [];
  fechas.forEach((f, i) => {
    const t = Date.parse(String(f)) / 1000;
    const v = valores[i];
    if (Number.isFinite(t) && typeof v === "number" && Number.isFinite(v)) puntos.push([t, v]);
  });
  const umbrales = (Array.isArray(j?.thresholds) ? j.thresholds : [])
    .map((u: any) => u?.value)
    .filter((v: unknown): v is number => typeof v === "number")
    .sort((a: number, b: number) => a - b);
  return { puntos, umbrales };
}

async function pedirSerie(elemento: string, producto: string, horas: number): Promise<Serie> {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - horas * 3600_000);
  const url = `${API}/${producto}/element/${elemento}?from=${desde.toISOString()}&to=${hasta.toISOString()}`;
  const r = await fetch(url, { headers: { "User-Agent": AGENTE, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Observatorio del Agua HTTP ${r.status}`);
  return adaptarSerie(await r.json());
}

/** Junta caudal y nivel por instante. */
export function juntar(caudal: [number, number][], nivel: [number, number][]): [number, number | null, number | null][] {
  const m = new Map<number, [number | null, number | null]>();
  for (const [t, v] of caudal) m.set(t, [v, m.get(t)?.[1] ?? null]);
  for (const [t, v] of nivel) m.set(t, [m.get(t)?.[0] ?? null, v]);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, [c, n]]) => [t, c, n]);
}

const umbralesGuardados = new Map<string, number[]>();

/** Lee las últimas horas de cada aforo y las guarda. Con D1 vacía, carga los 7 días que permite el servicio. */
export async function actualizarAforos(env: Env): Promise<void> {
  for (const a of AFOROS) {
    try {
      const hay = await env.DB.prepare("SELECT 1 FROM aforo_lecturas WHERE estacion = ? LIMIT 1").bind(a.id).first();
      const horas = hay ? 6 : 7 * 24;
      const [caudal, nivel] = await Promise.all([pedirSerie(a.elemento, PRODUCTO.caudal, horas), pedirSerie(a.elemento, PRODUCTO.nivel, horas)]);
      if (caudal.umbrales.length) umbralesGuardados.set(a.id, caudal.umbrales);
      const filas = juntar(caudal.puntos, nivel.puntos);
      const insertar = env.DB.prepare(
        "INSERT INTO aforo_lecturas (estacion, t, caudal, nivel) VALUES (?, ?, ?, ?) ON CONFLICT (estacion, t) DO UPDATE SET caudal = excluded.caudal, nivel = excluded.nivel",
      );
      for (let i = 0; i < filas.length; i += 50) {
        await env.DB.batch(filas.slice(i, i + 50).map(([t, c, n]) => insertar.bind(a.id, t, c, n)));
      }
    } catch (e) {
      console.error("aforo", a.id, e);
    }
  }
}

/** Variación del caudal en las últimas horas (para la flecha de tendencia). */
export function tendencia(serie: [number, number | null, number | null][], horas = 3): number | null {
  const con = serie.filter((s): s is [number, number, number | null] => s[1] !== null);
  const ultimo = con.at(-1);
  if (!ultimo) return null;
  const antes = [...con].reverse().find((s) => s[0] <= ultimo[0] - horas * 3600);
  return antes ? Math.round((ultimo[1] - antes[1]) * 100) / 100 : null;
}

/** Última lectura: el caudal llega unos minutos después que el nivel, así que se toma el último de cada uno. */
export function ultimaLectura(serie: [number, number | null, number | null][]): Aforo["ultimo"] {
  const c = [...serie].reverse().find((s) => s[1] !== null);
  const n = [...serie].reverse().find((s) => s[2] !== null);
  if (!c && !n) return null;
  return { t: (c ?? n)![0], caudal: c?.[1] ?? null, nivel: n?.[2] ?? null };
}

/** Aligera la serie: cada 10 minutos en las últimas 48 h y una lectura por hora en lo anterior. */
export function reducir(serie: [number, number | null, number | null][], ahora = Date.now() / 1000) {
  const limite = ahora - 48 * 3600;
  const out: typeof serie = [];
  let horaAnterior = -1;
  for (const p of serie) {
    if (p[0] >= limite) out.push(p);
    else {
      const h = Math.floor(p[0] / 3600);
      if (h !== horaAnterior) out.push(p);
      horaAnterior = h;
    }
  }
  return out;
}

export async function estadoAforos(env: Env): Promise<RespuestaAforos> {
  const desde = Math.floor(Date.now() / 1000) - DIAS * 86400;
  const aforos: Aforo[] = [];
  for (const a of AFOROS) {
    let serie = (
      await env.DB.prepare("SELECT t, caudal, nivel FROM aforo_lecturas WHERE estacion = ? AND t >= ? ORDER BY t")
        .bind(a.id, desde)
        .all<{ t: number; caudal: number | null; nivel: number | null }>()
    ).results.map((r) => [r.t, r.caudal, r.nivel] as [number, number | null, number | null]);
    // Primera vez (o sin cron, en local): se lee directamente del Observatorio
    if (!serie.length) {
      try {
        const [c, n] = await Promise.all([pedirSerie(a.elemento, PRODUCTO.caudal, 7 * 24), pedirSerie(a.elemento, PRODUCTO.nivel, 7 * 24)]);
        if (c.umbrales.length) umbralesGuardados.set(a.id, c.umbrales);
        serie = juntar(c.puntos, n.puntos);
      } catch (e) {
        console.error("aforo", a.id, e);
      }
    }
    aforos.push({
      id: a.id,
      nombre: a.nombre,
      rio: a.rio,
      codigo: a.codigo,
      ultimo: ultimaLectura(serie),
      tendencia: tendencia(serie),
      // Umbrales oficiales del Turia en Teruel por si aún no se han leído en esta instancia del Worker
      umbrales: umbralesGuardados.get(a.id) ?? (a.id === "turia-teruel" ? [20, 40, 50] : []),
      serie: reducir(serie),
    });
  }
  return { aforos };
}
