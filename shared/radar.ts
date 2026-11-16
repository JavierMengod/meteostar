// Selección de imágenes del radar para la animación.

/** Duraciones que se pueden elegir (minutos) y minutos entre imágenes de cada una: como mucho 25 imágenes. */
export const DURACIONES_RADAR: [minutos: number, nombre: string, paso: number][] = [
  [60, "1 h", 10],
  [180, "3 h", 10],
  [360, "6 h", 20],
  [720, "12 h", 30],
  [1440, "24 h", 60],
];

/** Las imágenes de los últimos `minutos`, una cada `paso` minutos contando hacia atrás desde la última. */
export function elegirImagenes<T extends { t: number }>(lista: T[], minutos: number, paso: number): T[] {
  if (!lista.length) return [];
  const ultima = lista[lista.length - 1].t;
  return lista.filter((img) => img.t >= ultima - minutos * 60 && (ultima - img.t) % (paso * 60) === 0);
}
