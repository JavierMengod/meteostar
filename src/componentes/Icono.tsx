// Iconos del tiempo dibujados en SVG (trazo), coloreados con variables CSS.
import { tipoCielo } from "../prevision";

const Sol = ({ x = 32, y = 32, r = 9 }: { x?: number; y?: number; r?: number }) => (
  <g className="i-sol">
    <circle cx={x} cy={y} r={r} />
    {Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return (
        <line
          key={i}
          x1={x + Math.cos(a) * (r + 4)}
          y1={y + Math.sin(a) * (r + 4)}
          x2={x + Math.cos(a) * (r + 8)}
          y2={y + Math.sin(a) * (r + 8)}
        />
      );
    })}
  </g>
);

const Luna = ({ x = 32, y = 30 }: { x?: number; y?: number }) => (
  <path className="i-luna" d={`M${x + 4} ${y - 12} a12 12 0 1 0 9 17 a10 10 0 0 1 -9 -17 z`} />
);

const Nube = ({ dx = 0, dy = 0, gris = false }: { dx?: number; dy?: number; gris?: boolean }) => (
  <path
    className={gris ? "i-nube gris" : "i-nube"}
    transform={`translate(${dx} ${dy})`}
    d="M18 46 h28 a9 9 0 0 0 0 -18 a13 13 0 0 0 -25 -3 a10 10 0 0 0 -3 21 z"
  />
);

const Gotas = ({ n = 3 }: { n?: number }) => (
  <g className="i-gota">
    {Array.from({ length: n }, (_, i) => (
      <line key={i} x1={24 + i * 8} y1={51} x2={21 + i * 8} y2={58} />
    ))}
  </g>
);

const Copos = () => (
  <g className="i-copo">
    {[24, 32, 40].map((x, i) => (
      <g key={x} transform={`translate(${x} ${54 + (i % 2) * 3})`}>
        <line x1="-3" y1="0" x2="3" y2="0" />
        <line x1="-1.5" y1="-2.6" x2="1.5" y2="2.6" />
        <line x1="-1.5" y1="2.6" x2="1.5" y2="-2.6" />
      </g>
    ))}
  </g>
);

const Rayo = () => <path className="i-rayo" d="M33 46 l-5 9 h6 l-4 8 l10 -11 h-6 l4 -6 z" />;

export default function Icono({ codigo, dia = true, size = 44 }: { codigo: number; dia?: boolean; size?: number }) {
  const tipo = tipoCielo(codigo);
  const astro = dia ? <Sol x={24} y={24} r={8} /> : <Luna x={22} y={24} />;
  let contenido;
  switch (tipo) {
    case "despejado":
      contenido = dia ? <Sol /> : <Luna x={30} y={32} />;
      break;
    case "poco-nuboso":
      contenido = (
        <>
          {astro}
          <Nube dx={4} dy={2} />
        </>
      );
      break;
    case "nuboso":
      contenido = (
        <>
          {astro}
          <Nube dx={2} dy={0} />
        </>
      );
      break;
    case "cubierto":
      contenido = (
        <>
          <Nube dx={-6} dy={-6} gris />
          <Nube dx={2} dy={0} />
        </>
      );
      break;
    case "niebla":
      contenido = (
        <g className="i-niebla">
          {[22, 30, 38, 46].map((y, i) => (
            <line key={y} x1={12 + (i % 2) * 4} y1={y} x2={52 - (i % 2) * 6} y2={y} />
          ))}
        </g>
      );
      break;
    case "llovizna":
      contenido = (
        <>
          <Nube dx={0} dy={-4} />
          <Gotas n={2} />
        </>
      );
      break;
    case "chubascos":
      contenido = (
        <>
          {astro}
          <Nube dx={2} dy={-4} />
          <Gotas />
        </>
      );
      break;
    case "lluvia":
      contenido = (
        <>
          <Nube dx={0} dy={-4} />
          <Gotas />
        </>
      );
      break;
    case "nieve":
      contenido = (
        <>
          <Nube dx={0} dy={-6} />
          <Copos />
        </>
      );
      break;
    case "tormenta":
      contenido = (
        <>
          <Nube dx={0} dy={-6} />
          <Rayo />
        </>
      );
      break;
  }
  return (
    <svg className="icono-tiempo" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {contenido}
    </svg>
  );
}
