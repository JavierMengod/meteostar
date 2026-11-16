// Rosa de los vientos de la última hora: cada sector muestra cuánto tiempo sopló de esa dirección,
// coloreado según la velocidad media.
import type { VientoMinuto } from "../../shared/tipos";

export const CLASES_VIENTO = [
  { hasta: 6, nombre: "<6", color: "var(--v1)" },
  { hasta: 12, nombre: "6–11", color: "var(--v2)" },
  { hasta: 20, nombre: "12–19", color: "var(--v3)" },
  { hasta: 29, nombre: "20–28", color: "var(--v4)" },
  { hasta: 39, nombre: "29–38", color: "var(--v5)" },
  { hasta: Infinity, nombre: "39+", color: "var(--v6)" },
];
const colorVelocidad = (v: number) => CLASES_VIENTO.find((c) => v < c.hasta)!.color;

const PUNTOS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

export default function RosaViento({ minutos, actual, dir }: { minutos: VientoMinuto[]; actual: number | null; dir: number | null }) {
  const sectores = Array.from({ length: 16 }, () => ({ cuenta: 0, suma: 0 }));
  for (const m of minutos) {
    if (m.dir === null || m.viento === null || m.viento < 1) continue;
    const s = Math.round(m.dir / 22.5) % 16;
    sectores[s].cuenta++;
    sectores[s].suma += m.viento;
  }
  const max = Math.max(1, ...sectores.map((s) => s.cuenta));
  const R = 78;
  const c = 100;
  const sector = (i: number, r: number) => {
    const a0 = ((i * 22.5 - 10) * Math.PI) / 180;
    const a1 = ((i * 22.5 + 10) * Math.PI) / 180;
    const p = (a: number) => `${c + Math.sin(a) * r} ${c - Math.cos(a) * r}`;
    return `M${c} ${c} L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`;
  };
  return (
    <svg className="rosa" viewBox="0 0 200 200" role="img" aria-label="Rosa de los vientos de la última hora">
      {[0.33, 0.66, 1].map((f) => (
        <circle key={f} cx={c} cy={c} r={R * f} className="rosa-anillo" />
      ))}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * 45 * Math.PI) / 180;
        return <line key={i} x1={c} y1={c} x2={c + Math.sin(a) * R} y2={c - Math.cos(a) * R} className="rosa-anillo" />;
      })}
      {sectores.map((s, i) =>
        s.cuenta ? <path key={i} d={sector(i, 14 + (R - 14) * (s.cuenta / max))} fill={colorVelocidad(s.suma / s.cuenta)} opacity="0.85" /> : null,
      )}
      {dir !== null && (
        <path
          d={`M${c} ${c - R + 6} l-6 -11 h12 z`}
          transform={`rotate(${dir} ${c} ${c})`}
          className="rosa-flecha"
        />
      )}
      <circle cx={c} cy={c} r="21" className="rosa-centro" />
      <text x={c} y={c + 3} className="rosa-valor">
        {actual === null ? "—" : Math.round(actual)}
      </text>
      <text x={c} y={c + 14} className="rosa-unidad">
        km/h
      </text>
      {PUNTOS.map((p, i) => {
        const a = (i * 45 * Math.PI) / 180;
        return (
          <text key={p} x={c + Math.sin(a) * (R + 13)} y={c - Math.cos(a) * (R + 13) + 4} className={i % 2 ? "rosa-punto menor" : "rosa-punto"}>
            {p}
          </text>
        );
      })}
    </svg>
  );
}
