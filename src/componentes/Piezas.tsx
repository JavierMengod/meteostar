// Piezas pequeñas reutilizables.
import type { ReactNode } from "react";
import type { Lectura } from "../../shared/tipos";
import { conSigno, n } from "../formato";
import { margenDirecto } from "../estaciones";
import Paisaje, { type Fase } from "./Paisaje";

export function Hero({
  fase,
  antetitulo,
  titulo,
  subtitulo,
  pie,
  alineacion = "izquierda",
  compacto = false,
}: {
  fase: Fase;
  antetitulo?: ReactNode;
  titulo: string;
  subtitulo?: ReactNode;
  pie?: ReactNode;
  alineacion?: "izquierda" | "derecha";
  compacto?: boolean;
}) {
  return (
    <section className={`hero ${compacto ? "compacto" : ""} ${alineacion}`}>
      <Paisaje fase={fase} />
      <div className="hero-texto">
        {antetitulo && <p className="hero-ante">{antetitulo}</p>}
        <h1>{titulo}</h1>
        {subtitulo && <p className="hero-sub">{subtitulo}</p>}
      </div>
      {pie && <div className="hero-pie">{pie}</div>}
    </section>
  );
}

export function CabeceraSeccion({ titulo, nota, id }: { titulo: string; nota?: ReactNode; id?: string }) {
  return (
    <div className="cabecera-seccion" id={id}>
      <h2>{titulo}</h2>
      {nota && <p>{nota}</p>}
    </div>
  );
}

/** Barra de temperatura del día con el valor actual. */
export function BarraMinMax({
  min,
  max,
  actual,
  escalaMin,
  escalaMax,
}: {
  min: number | null;
  max: number | null;
  actual: number | null;
  escalaMin?: number;
  escalaMax?: number;
}) {
  if (min === null || max === null) return null;
  const lo = escalaMin ?? min - 3;
  const hi = escalaMax ?? max + 3;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="barra-minmax">
      <div className="barra-rango" style={{ left: pos(min), right: `calc(100% - ${pos(max)})` }} />
      {actual !== null && <div className="barra-marca" style={{ left: pos(actual) }} />}
    </div>
  );
}

/** Pastilla de tendencia: ▲ +0,4° / h */
export function Tendencia({ actual, antes, unidad, sufijo }: { actual: number | null; antes: number | null; unidad: string; sufijo: string }) {
  if (actual === null || antes === null) return null;
  const d = actual - antes;
  const clase = Math.abs(d) < 0.05 ? "estable" : d > 0 ? "sube" : "baja";
  const flecha = clase === "estable" ? "=" : clase === "sube" ? "▲" : "▼";
  return (
    <span className={`tendencia ${clase}`}>
      {flecha} {conSigno(d)}
      {unidad} {sufijo}
    </span>
  );
}

/** Punto «en directo» con la hora del último dato; se apaga si el dato es viejo para lo que publica su red. */
export function Directo({ lectura, ahora, fuente }: { lectura: Lectura | null; ahora: number; fuente?: string }) {
  if (!lectura) return <span className="directo apagado">Sin datos</span>;
  const viejo = ahora - lectura.ts > margenDirecto(fuente);
  return (
    <span className={viejo ? "directo apagado" : "directo"}>
      <i />
      <span className="mono">{new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(lectura.ts * 1000)}</span>
    </span>
  );
}

export function Dato({ etiqueta, valor, unidad, decimales = 1, clase }: { etiqueta: string; valor: number | null; unidad: string; decimales?: number; clase?: string }) {
  return (
    <div className={`dato ${clase ?? ""}`}>
      <small>{etiqueta}</small>
      <b>
        {n(valor, decimales)}
        <span>{unidad}</span>
      </b>
    </div>
  );
}

export function Cargando({ error }: { error?: string | null }) {
  return <div className="cargando">{error ? `No se pudieron cargar los datos (${error}).` : "Cargando…"}</div>;
}
