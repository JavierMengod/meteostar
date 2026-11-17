// Ríos: situación de un aforo (aviso oficial y cómo va frente a lo normal), tendencia y mensaje de la previsión.
// Compartido por la web y los tests.
import { comparaNormal } from "./hidrologia";
import type { Aforo, RespuestaRio } from "./tipos";

const formatos = new Map<number, Intl.NumberFormat>();
const n = (v: number, decimales = 1) => {
  if (!formatos.has(decimales)) formatos.set(decimales, new Intl.NumberFormat("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }));
  return formatos.get(decimales)!.format(v);
};
const fmtDia = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
/** «el jueves 19 nov» */
const elDia = (fecha: string) => `el ${fmtDia.format(new Date(`${fecha}T12:00:00Z`)).replace(",", "").replace(".", "")}`;

export const NOMBRES_AVISO = ["Aviso amarillo", "Aviso naranja", "Aviso rojo"];
const COLORES_AVISO = ["#e0b400", "#ff8c1a", "#da1616"];
/** Colores por nivel respecto a lo normal: muy bajo, bajo, normal, alto, muy alto */
export const COLORES_NIVEL = ["#d4502c", "#d08a10", "#2b82d9", "#1f5fbf", "#6a3fc4"];

/** Nivel de aviso según los umbrales oficiales: -1 sin aviso, 0 amarillo, 1 naranja, 2 rojo. */
export function nivelAviso(caudal: number | null, umbrales: number[]): number {
  let nivel = -1;
  if (caudal === null) return nivel;
  umbrales.forEach((u, i) => {
    if (caudal >= u) nivel = i;
  });
  return nivel;
}

/** Situación de un aforo: aviso oficial (si lo hay) y cómo va frente a lo normal de la época. */
export function situacionAforo(a: Pick<Aforo, "ultimo" | "umbrales" | "normalHoy">) {
  const caudal = a.ultimo?.caudal ?? null;
  const aviso = nivelAviso(caudal, a.umbrales);
  const normal = caudal !== null && a.normalHoy ? comparaNormal(caudal, a.normalHoy) : null;
  const siguiente = a.umbrales[aviso + 1];
  return {
    caudal,
    aviso,
    textoAviso: aviso >= 0 ? NOMBRES_AVISO[aviso] : a.umbrales.length ? "Sin aviso" : null,
    siguienteAviso: siguiente !== undefined ? `${NOMBRES_AVISO[aviso + 1] ?? "Aviso"} a partir de ${n(siguiente, 0)} m³/s` : null,
    normal,
    /** Color para el mapa y las tarjetas: el del aviso si lo hay; si no, el de lo normal */
    color: aviso >= 0 ? COLORES_AVISO[aviso] : normal ? COLORES_NIVEL[normal.nivel + 2] : "#6b7280",
  };
}

/** Texto de la tendencia de las últimas 3 horas. */
export function textoTendencia(v: number | null): { texto: string; clase: string; flecha: string } | null {
  if (v === null) return null;
  if (v > 0.05) return { texto: `Subiendo (+${n(v, 2)} m³/s en 3 h)`, clase: "sube", flecha: "▲" };
  if (v < -0.05) return { texto: `Bajando (−${n(-v, 2)} m³/s en 3 h)`, clase: "baja", flecha: "▼" };
  return { texto: "Estable", clase: "estable", flecha: "●" };
}

/** Un único mensaje para la previsión: lo más probable y, si lo hay, el riesgo del escenario más lluvioso. */
export function mensajePrevision(p: RespuestaRio): { titulo: string; clase: string; detalle: string | null } | null {
  const hoy = p.dias.filter((d) => !d.prevision && d.caudal !== null).at(-1);
  const proximos = p.dias.filter((d) => d.prevision && d.caudal !== null).slice(0, 7);
  if (!hoy || !proximos.length) return null;
  const base = Math.max(hoy.caudal!, 0.05);
  const max = proximos.reduce((m, d) => (d.caudal! > m.caudal! ? d : m));
  const fin = proximos.at(-1)!.caudal!;
  let titulo: string;
  let clase = "estable";
  if (p.aviso?.nivel === "probable") {
    titulo = `Crecida probable desde ${elDia(p.aviso.fecha)}`;
    clase = "alto";
  } else if (max.caudal! / base >= 1.3) {
    titulo = `Lo más probable: subirá en los próximos días${p.corregida ? `, hasta unos ${n(max.caudal!, max.caudal! < 10 ? 1 : 0)} m³/s` : ""}`;
    clase = "sube";
  } else if (fin / base <= 0.75) {
    titulo = "Lo más probable: seguirá bajando";
    clase = "baja";
  } else {
    titulo = "Lo más probable: sin cambios importantes";
  }
  let detalle: string | null = null;
  if (p.aviso?.nivel === "posible") {
    detalle = `En 1 de cada 4 escenarios podría crecer desde ${elDia(p.aviso.fecha)}${p.corregida ? ` (hasta ${n(p.aviso.caudal, 1)} m³/s)` : ""}.`;
  } else if (p.aviso?.nivel === "probable" && p.corregida) {
    detalle = `Hasta unos ${n(p.aviso.caudal, 1)} m³/s, por encima de lo habitual para la época.`;
  }
  return { titulo, clase, detalle };
}
