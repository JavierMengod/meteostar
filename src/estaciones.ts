// Utilidades de la sección de estaciones.
import type { RespuestaDatos } from "../shared/tipos";

/** Margen para considerar una lectura «en directo»: 20 min; 45 en Meteoclimatic (publica cada 10-20); 90 en AEMET (horaria). */
const MARGEN: Record<string, number> = { aemet: 5400, meteoclimatic: 2700 };
export const enDirecto = (d: RespuestaDatos, ahora: number) => !!d.actual && ahora - d.actual.ts < (MARGEN[d.estacion.fuente] ?? 1200);

export const COLOR_SIN_DATOS = "#9ca3af";

/** Escala de colores de la temperatura (para los puntos del mapa y de la lista). */
export const ESCALA_TEMP: [number, string, string][] = [
  [-Infinity, "#6d4fc2", "Menos de 0 °"],
  [0, "#2b82d9", "0–10 °"],
  [10, "#0e9f6e", "10–20 °"],
  [20, "#d08a10", "20–30 °"],
  [30, "#d4502c", "Más de 30 °"],
];

export function colorTemp(t: number | null | undefined): string {
  if (t === null || t === undefined) return COLOR_SIN_DATOS;
  let c = ESCALA_TEMP[0][1];
  for (const [desde, color] of ESCALA_TEMP) if (t >= desde) c = color;
  return c;
}
