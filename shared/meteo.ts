// Conversión de unidades y cálculos meteorológicos.

export const redondear = (v: number | null, decimales = 1): number | null =>
  v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** decimales) / 10 ** decimales;

export const fAC = (f: number) => ((f - 32) * 5) / 9;
export const mphAKmh = (mph: number) => mph * 1.609344;
export const inHgAHpa = (inHg: number) => inHg * 33.8638866667;
export const pulgAMm = (pulg: number) => pulg * 25.4;

/** Punto de rocío (fórmula de Magnus). */
export function puntoRocio(t: number | null, h: number | null): number | null {
  if (t === null || h === null || h <= 0) return null;
  const a = 17.62;
  const b = 243.12;
  const g = Math.log(h / 100) + (a * t) / (b + t);
  return (b * g) / (a - g);
}

/** Sensación térmica: wind chill con frío y viento, índice de calor con calor y humedad. */
export function sensacionTermica(t: number | null, h: number | null, vientoKmh: number | null): number | null {
  if (t === null) return null;
  if (t <= 10 && vientoKmh !== null && vientoKmh > 4.8) {
    const v = vientoKmh ** 0.16;
    return 13.12 + 0.6215 * t - 11.37 * v + 0.3965 * t * v;
  }
  if (t >= 27 && h !== null && h >= 40) {
    const f = (t * 9) / 5 + 32;
    const hi =
      -42.379 +
      2.04901523 * f +
      10.14333127 * h -
      0.22475541 * f * h -
      0.00683783 * f * f -
      0.05481717 * h * h +
      0.00122874 * f * f * h +
      0.00085282 * f * h * h -
      0.00000199 * f * f * h * h;
    return ((hi - 32) * 5) / 9;
  }
  return t;
}

const PUNTOS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];

/** Dirección del viento en grados → punto cardinal (en castellano). */
export function puntoCardinal(grados: number | null): string {
  if (grados === null) return "—";
  return PUNTOS[Math.round((((grados % 360) + 360) % 360) / 22.5) % 16];
}
