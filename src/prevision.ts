// Interpretación de los códigos de tiempo WMO de Open-Meteo y textos de previsión.
import type { PrevisionDia, PrevisionHora } from "../shared/tipos";

export type TipoCielo =
  | "despejado"
  | "poco-nuboso"
  | "nuboso"
  | "cubierto"
  | "niebla"
  | "llovizna"
  | "lluvia"
  | "chubascos"
  | "nieve"
  | "tormenta";

const CODIGOS: Record<number, [string, TipoCielo]> = {
  0: ["Despejado", "despejado"],
  1: ["Poco nuboso", "poco-nuboso"],
  2: ["Intervalos nubosos", "nuboso"],
  3: ["Cubierto", "cubierto"],
  45: ["Niebla", "niebla"],
  48: ["Niebla con escarcha", "niebla"],
  51: ["Llovizna débil", "llovizna"],
  53: ["Llovizna", "llovizna"],
  55: ["Llovizna intensa", "llovizna"],
  56: ["Llovizna helada", "llovizna"],
  57: ["Llovizna helada", "llovizna"],
  61: ["Lluvia débil", "lluvia"],
  63: ["Lluvia moderada", "lluvia"],
  65: ["Lluvia fuerte", "lluvia"],
  66: ["Lluvia helada", "lluvia"],
  67: ["Lluvia helada", "lluvia"],
  71: ["Nieve débil", "nieve"],
  73: ["Nieve", "nieve"],
  75: ["Nieve fuerte", "nieve"],
  77: ["Cinarra", "nieve"],
  80: ["Chubascos débiles", "chubascos"],
  81: ["Chubascos", "chubascos"],
  82: ["Chubascos fuertes", "chubascos"],
  85: ["Chubascos de nieve", "nieve"],
  86: ["Chubascos de nieve", "nieve"],
  95: ["Tormenta", "tormenta"],
  96: ["Tormenta con granizo", "tormenta"],
  99: ["Tormenta con granizo", "tormenta"],
};

export const descripcion = (codigo: number) => CODIGOS[codigo]?.[0] ?? "—";
export const tipoCielo = (codigo: number): TipoCielo => CODIGOS[codigo]?.[1] ?? "nuboso";

const DIRECCIONES = ["norte", "nordeste", "este", "sudeste", "sur", "suroeste", "oeste", "noroeste"];
export const direccionLarga = (grados: number) => DIRECCIONES[Math.round((((grados % 360) + 360) % 360) / 45) % 8];

export function fuerzaViento(kmh: number): string {
  if (kmh < 6) return "en calma";
  if (kmh < 20) return "flojo";
  if (kmh < 40) return "moderado";
  if (kmh < 70) return "fuerte";
  return "muy fuerte";
}

// Peso para decidir el "cielo dominante" de un tramo: lo más significativo gana
const PESO: Record<TipoCielo, number> = {
  despejado: 0,
  "poco-nuboso": 1,
  nuboso: 2,
  cubierto: 3,
  niebla: 4,
  llovizna: 5,
  lluvia: 6,
  chubascos: 6,
  nieve: 7,
  tormenta: 8,
};

const CIELO_TEXTO: Record<TipoCielo, string> = {
  despejado: "despejado",
  "poco-nuboso": "poco nuboso",
  nuboso: "con intervalos nubosos",
  cubierto: "cubierto",
  niebla: "con nieblas",
  llovizna: "con lloviznas",
  lluvia: "con lluvia",
  chubascos: "con chubascos",
  nieve: "con nieve",
  tormenta: "con tormentas",
};

function dominante(horas: PrevisionHora[]): TipoCielo | null {
  if (!horas.length) return null;
  const cuenta = new Map<TipoCielo, number>();
  for (const h of horas) {
    const t = tipoCielo(h.codigo);
    cuenta.set(t, (cuenta.get(t) ?? 0) + 1 + PESO[t] * 0.35);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const horaLocal = (t: number) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(t * 1000));

/** Texto de previsión para un día, a partir de sus horas (si las hay) y su resumen diario. */
export function textoDia(dia: PrevisionDia, horas: PrevisionHora[]): string {
  const delDia = horas.filter((h) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(h.t * 1000) === dia.fecha);
  const manana = dominante(delDia.filter((h) => horaLocal(h.t) >= 7 && horaLocal(h.t) < 14));
  const tarde = dominante(delDia.filter((h) => horaLocal(h.t) >= 14 && horaLocal(h.t) < 22));
  let cielo: string;
  if (manana && tarde && manana !== tarde) {
    cielo = `${cap(CIELO_TEXTO[manana])} por la mañana y ${CIELO_TEXTO[tarde]} por la tarde.`;
  } else {
    cielo = `${cap(CIELO_TEXTO[manana ?? tipoCielo(dia.codigo)])} durante todo el día.`;
  }
  const temp = ` Máxima de ${Math.round(dia.tmax)} °C y mínima de ${Math.round(dia.tmin)} °C`;
  const fuerza = fuerzaViento(dia.viento);
  const viento = fuerza === "en calma" ? ", con viento en calma." : `, con viento ${fuerza} del ${direccionLarga(dia.dir)}.`;
  const lluvia =
    dia.lluvia >= 0.2
      ? ` Probabilidad de precipitación del ${dia.prob} % (${dia.lluvia.toLocaleString("es-ES")} mm).`
      : "";
  const helada = dia.tmin <= 0 ? " Heladas al amanecer." : "";
  return cielo + temp + viento + lluvia + helada;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
