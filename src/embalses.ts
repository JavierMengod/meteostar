// Utilidades de la sección de embalses.

/** Color según lo lleno que está. */
export function colorEmbalse(p: number | null): string {
  if (p === null) return "var(--texto-suave)";
  if (p >= 75) return "var(--e-alto)";
  if (p >= 50) return "var(--e-medio)";
  if (p >= 25) return "var(--e-bajo)";
  return "var(--e-muy-bajo)";
}
