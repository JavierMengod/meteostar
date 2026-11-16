// Fechas en hora local de la estación (Europe/Madrid).
export const ZONA = "Europe/Madrid";

const formato = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partes(ts: number) {
  const p = Object.fromEntries(formato.formatToParts(new Date(ts * 1000)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Fecha local "YYYY-MM-DD" de un instante. */
export function fechaLocal(ts: number): string {
  const { y, m, d } = partes(ts);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Diferencia (s) entre la hora local y UTC en un instante. */
export function desfase(ts: number): number {
  const { y, m, d, h, min, s } = partes(ts);
  return Date.UTC(y, m - 1, d, h, min, s) / 1000 - ts;
}

/** Instante (s UTC) de la medianoche local de una fecha "YYYY-MM-DD". */
export function inicioDia(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d) / 1000;
  return utc - desfase(utc - desfase(utc));
}

/** Fecha local del día anterior. */
export function fechaAnterior(fecha: string): string {
  return fechaLocal(inicioDia(fecha) - 12 * 3600);
}

/** "YYYY-MM-DD HH:MM:SS" en hora de Madrid → segundos Unix. */
export function localAUnix(texto: string): number {
  const comoUtc = Date.parse(texto.replace(" ", "T") + "Z") / 1000;
  return comoUtc - desfase(comoUtc - desfase(comoUtc));
}
