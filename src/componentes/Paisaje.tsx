// Paisaje del valle del Turia (muelas, chopos y el pueblo) dibujado en SVG.
// El cielo cambia según la hora: noche, amanecer/atardecer o día.
import { useMemo } from "react";

export type Fase = "noche" | "crepusculo" | "dia";

/** Fase del día a partir de la salida y la puesta del sol (segundos Unix). */
export function faseDelDia(ahora: number, salida?: number, puesta?: number): Fase {
  const s = salida ?? ahora - (ahora % 86400) + 6.5 * 3600;
  const p = puesta ?? ahora - (ahora % 86400) + 17 * 3600;
  if (Math.abs(ahora - s) < 2700 || Math.abs(ahora - p) < 2700) return "crepusculo";
  return ahora > s && ahora < p ? "dia" : "noche";
}

const CIELOS: Record<Fase, string[]> = {
  noche: ["#070b1d", "#141c45", "#2c3466"],
  crepusculo: ["#232554", "#8f4a7c", "#f19a5a"],
  dia: ["#2f6fb3", "#6fa9dc", "#cfe6f3"],
};

const CAPAS: Record<Fase, string[]> = {
  // muelas lejanas, colinas, vega, primer plano
  noche: ["#283058", "#1c2246", "#121733", "#0a0d20"],
  crepusculo: ["#6a4d78", "#4a3560", "#2f2347", "#1a1430"],
  dia: ["#9fb6c9", "#7d8f74", "#5d7350", "#3a4a33"],
};

// Estrellas en posiciones fijas (pseudoaleatorias)
const ESTRELLAS = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 977) % 1200,
  y: (i * 613) % 230,
  r: 0.6 + ((i * 37) % 10) / 10,
}));

export default function Paisaje({ fase }: { fase: Fase }) {
  const cielo = CIELOS[fase];
  const capa = CAPAS[fase];
  const chopos = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        x: 40 + i * 34 + ((i * 53) % 17),
        h: 26 + ((i * 29) % 18),
      })),
    [],
  );
  return (
    <svg className="paisaje" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={cielo[0]} />
          <stop offset="0.6" stopColor={cielo[1]} />
          <stop offset="1" stopColor={cielo[2]} />
        </linearGradient>
        <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={fase === "noche" ? "#e8ecff" : "#fff6d6"} stopOpacity="0.9" />
          <stop offset="1" stopColor={fase === "noche" ? "#e8ecff" : "#fff6d6"} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="velo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.25" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      <rect width="1200" height="420" fill="url(#cielo)" />

      {fase === "noche" &&
        ESTRELLAS.map((e, i) => <circle key={i} cx={e.x} cy={e.y} r={e.r} fill="#fff" opacity={0.35 + (i % 5) / 8} />)}

      {/* Sol o luna */}
      {fase === "noche" ? (
        <g>
          <circle cx="930" cy="80" r="60" fill="url(#halo)" opacity="0.5" />
          <circle cx="930" cy="80" r="17" fill="#f1f3ff" />
          <circle cx="938" cy="74" r="15" fill={cielo[0]} opacity="0.85" />
        </g>
      ) : fase === "crepusculo" ? (
        <g>
          <circle cx="300" cy="250" r="140" fill="url(#halo)" opacity="0.7" />
          <circle cx="300" cy="250" r="26" fill="#ffd38a" />
        </g>
      ) : (
        <g>
          <circle cx="900" cy="80" r="110" fill="url(#halo)" opacity="0.8" />
          <circle cx="900" cy="80" r="24" fill="#fff4cf" />
        </g>
      )}

      {/* Muelas lejanas: cerros de cima plana típicos de Teruel */}
      <path
        fill={capa[0]}
        d="M0 250 L60 238 L95 212 L210 208 L240 226 L300 230 L330 196 L470 190 L505 214 L560 220 L600 205 L640 178
           L790 172 L820 198 L880 206 L930 186 L1040 182 L1070 210 L1130 214 L1200 200 L1200 420 L0 420 Z"
      />
      {/* Colinas */}
      <path
        fill={capa[1]}
        d="M0 290 C80 262 150 270 220 258 C300 244 360 268 430 262 C520 254 560 236 650 244 C740 252 790 270 880 262
           C960 255 1030 240 1110 250 C1150 255 1180 262 1200 262 L1200 420 L0 420 Z"
      />
      {/* Vega del Turia con chopos */}
      <path fill={capa[2]} d="M0 318 C200 300 400 312 600 306 C800 300 1000 314 1200 304 L1200 420 L0 420 Z" />
      <g fill={capa[2]}>
        {chopos.map((c, i) => (
          <ellipse key={i} cx={c.x} cy={314 - c.h / 2} rx={5.5} ry={c.h / 2} />
        ))}
      </g>

      {/* El pueblo: casas y la torre de la iglesia */}
      <g fill={capa[3]}>
        <rect x="470" y="300" width="36" height="22" />
        <polygon points="466,300 488,288 510,300" />
        <rect x="510" y="294" width="44" height="28" />
        <polygon points="506,294 532,282 558,294" />
        <rect x="560" y="268" width="20" height="54" />
        <polygon points="556,268 570,250 584,268" />
        <rect x="584" y="302" width="40" height="20" />
        <polygon points="580,302 604,292 628,302" />
        <rect x="628" y="296" width="30" height="26" />
        <rect x="662" y="304" width="38" height="18" />
        <polygon points="658,304 681,294 704,304" />
      </g>
      {fase !== "dia" && (
        <g fill="#ffd27a">
          {[
            [480, 308],
            [522, 304],
            [538, 310],
            [596, 309],
            [640, 306],
            [676, 311],
            [568, 280],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="3.5" height="4" opacity="0.9" />
          ))}
        </g>
      )}

      {/* Primer plano y estación meteorológica */}
      <path fill={capa[3]} d="M0 360 C240 336 520 352 760 340 C940 332 1080 340 1200 330 L1200 420 L0 420 Z" />
      <g stroke={capa[3]} fill={capa[3]} strokeLinecap="round">
        <line x1="1010" y1="338" x2="1010" y2="150" strokeWidth="5" />
        <line x1="1010" y1="168" x2="1062" y2="168" strokeWidth="3" />
        {/* Anemómetro de cazoletas */}
        <line x1="1062" y1="168" x2="1062" y2="140" strokeWidth="3" />
        <line x1="1044" y1="140" x2="1080" y2="140" strokeWidth="2.5" />
        <circle cx="1044" cy="140" r="6" />
        <circle cx="1080" cy="140" r="6" />
        <circle cx="1062" cy="134" r="5" />
        {/* Garita / sensor WS69 */}
        <line x1="1010" y1="236" x2="964" y2="236" strokeWidth="3" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={952 - i * 0.5} y={236 + i * 9} width={24 + i} height="6" rx="2" stroke="none" />
        ))}
        {/* Panel solar */}
        <polygon points="1016,206 1050,196 1050,222 1016,230" stroke="none" />
      </g>

      <rect width="1200" height="420" fill="url(#velo)" />
    </svg>
  );
}
