// Salida y puesta del sol de un día en un sitio (ecuación del amanecer; error de un par de minutos, de sobra para
// sombrear las noches en las gráficas).

const RAD = Math.PI / 180;

/** Salida y puesta (segundos Unix) del día «fecha» (aaaa-mm-dd) en lat/lon. null si no sale o no se pone. */
export function solDia(fecha: string, lat: number, lon: number): { salida: number; puesta: number } | null {
  const [y, m, d] = fecha.split("-").map(Number);
  const jd = Date.UTC(y, m - 1, d, 12) / 86400000 + 2440587.5;
  const n = Math.round(jd - 2451545.0 + 0.0008);
  const jEstrella = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jEstrella) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransito = 2451545.0 + jEstrella + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const senDelta = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDelta = Math.cos(Math.asin(senDelta));
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * senDelta) / (Math.cos(lat * RAD) * cosDelta);
  if (cosW < -1 || cosW > 1) return null;
  const w = Math.acos(cosW) / RAD;
  const aUnix = (j: number) => Math.round((j - 2440587.5) * 86400);
  return { salida: aUnix(jTransito - w / 360), puesta: aUnix(jTransito + w / 360) };
}
