const ZONA = "Europe/Madrid";

const fmtHora = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" });
const fmtDiaHora = new Intl.DateTimeFormat("es-ES", {
  timeZone: ZONA,
  weekday: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const fmtFecha = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });

export const hora = (ts: number | null | undefined) => (ts ? fmtHora.format(ts * 1000) : "—");
export const diaHora = (ts: number) => fmtDiaHora.format(ts * 1000);
export const fechaLarga = (ts: number) => fmtFecha.format(ts * 1000);

/** Número con decimales en formato español, o "—" si no hay dato. */
export function n(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** "hace 2 min", "hace 3 h"… */
export function hace(segundos: number): string {
  if (segundos < 90) return "hace un momento";
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.round(segundos / 3600)} h`;
  const dias = Math.round(segundos / 86400);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

export function nivelUv(uv: number | null): string {
  if (uv === null) return "";
  if (uv < 3) return "bajo";
  if (uv < 6) return "moderado";
  if (uv < 8) return "alto";
  if (uv < 11) return "muy alto";
  return "extremo";
}

// Fechas "YYYY-MM-DD" (día local): se interpretan a mediodía UTC para no cambiar de día
const deFecha = (fecha: string) => new Date(`${fecha}T12:00:00Z`);
const fmtCorta = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtCortaAnio = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtSemana = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "UTC" });
const fmtLargaFecha = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const fmtMes = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const fmtMesSolo = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" });

export const fechaCorta = (fecha: string, conAnio = false) =>
  (conAnio ? fmtCortaAnio : fmtCorta).format(deFecha(fecha)).replace(".", "");
export const diaSemana = (fecha: string) => fmtSemana.format(deFecha(fecha));
export const fechaCompleta = (fecha: string) => fmtLargaFecha.format(deFecha(fecha));
export const nombreMes = (mes: string) => fmtMes.format(deFecha(`${mes}-15`));
export const soloMes = (mes: string) => fmtMesSolo.format(deFecha(`${mes}-15`));
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Fecha local "YYYY-MM-DD" de un instante. */
export const fechaDe = (ts: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ts * 1000);

/** Suma días a una fecha "YYYY-MM-DD". */
export function sumarDias(fecha: string, dias: number): string {
  const d = deFecha(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Valor con signo: "+1,2" / "−0,3" */
export function conSigno(v: number, decimales = 1): string {
  const s = Math.abs(v).toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

const BEAUFORT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
const NOMBRES_BEAUFORT = [
  "Calma",
  "Ventolina",
  "Brisa muy débil",
  "Brisa débil",
  "Brisa moderada",
  "Brisa fresca",
  "Brisa fuerte",
  "Viento fuerte",
  "Temporal",
  "Temporal fuerte",
  "Temporal muy fuerte",
  "Borrasca",
  "Huracán",
];
export function beaufort(kmh: number | null): { fuerza: number; nombre: string } {
  const f = kmh === null ? 0 : BEAUFORT.findIndex((l) => kmh < l);
  const fuerza = f === -1 ? 12 : f;
  return { fuerza, nombre: NOMBRES_BEAUFORT[fuerza] };
}
