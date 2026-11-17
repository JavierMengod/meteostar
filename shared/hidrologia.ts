// Utilidades del año hidrológico (de octubre a septiembre), compartidas por el Worker y la web.

/** Año hidrológico (empieza el 1 de octubre): 2021 = de octubre de 2021 a septiembre de 2022. */
export const anioHidrologico = (fecha: string) =>
  Number(fecha.slice(0, 4)) - (Number(fecha.slice(5, 7)) < 10 ? 1 : 0);

/** Posición del día dentro del año hidrológico (0 = 1 de octubre), con 366 huecos para que coincidan todos los años. */
export function diaHidrologico(fecha: string): number {
  const m = Number(fecha.slice(5, 7));
  const d = Number(fecha.slice(8, 10));
  // Meses de un año bisiesto empezando en octubre
  const dias = [31, 30, 31, 31, 29, 31, 30, 31, 30, 31, 31, 30];
  const orden = (m + 2) % 12; // octubre → 0
  let pos = 0;
  for (let i = 0; i < orden; i++) pos += dias[i];
  return pos + d - 1;
}

/** Primer día de cada mes dentro del año hidrológico, con su nombre corto (octubre primero). */
export const MESES_HIDROLOGICOS: [number, string][] = [
  [0, "oct"],
  [31, "nov"],
  [61, "dic"],
  [92, "ene"],
  [123, "feb"],
  [152, "mar"],
  [183, "abr"],
  [213, "may"],
  [244, "jun"],
  [274, "jul"],
  [305, "ago"],
  [336, "sep"],
];

/** Nombre de un año hidrológico: 2021 → «2021-22». */
export const nombreAnioHidrologico = (anio: number) =>
  `${anio}-${String((anio + 1) % 100).padStart(2, "0")}`;

/** Cómo va un caudal respecto a los percentiles de su época: nivel de -2 (muy bajo) a 2 (muy alto). */
export function comparaNormal(caudal: number, p: [number, number, number, number, number]): { texto: string; corto: string; clase: string; nivel: number } {
  if (caudal < p[0]) return { texto: "Muy por debajo de lo normal", corto: "Muy bajo", clase: "baja", nivel: -2 };
  if (caudal < p[1]) return { texto: "Por debajo de lo normal", corto: "Bajo", clase: "baja", nivel: -1 };
  if (caudal <= p[3]) return { texto: "Normal para la época", corto: "Normal", clase: "estable", nivel: 0 };
  if (caudal <= p[4]) return { texto: "Por encima de lo normal", corto: "Alto", clase: "sube", nivel: 1 };
  return { texto: "Muy por encima de lo normal", corto: "Muy alto", clase: "sube", nivel: 2 };
}
