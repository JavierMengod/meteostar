// Gráficas de evolución de la estación (Recharts).
import type { ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PuntoHistorico } from "../../shared/tipos";
import { diaHora, hora, n } from "../formato";

const ejeX = (horas: number) => (
  <XAxis
    dataKey="t"
    type="number"
    scale="time"
    domain={["dataMin", "dataMax"]}
    tickFormatter={(t: number) => (horas > 48 ? diaHora(t).split(",")[0] : hora(t))}
    minTickGap={36}
    tick={{ className: "eje" }}
    stroke="var(--borde)"
  />
);
const ejeY = (props: Record<string, unknown> = {}) => (
  <YAxis width={44} tick={{ className: "eje" }} stroke="var(--borde)" domain={["auto", "auto"]} {...props} />
);
const rejilla = <CartesianGrid stroke="var(--rejilla)" vertical={false} />;
const leyenda = <Legend verticalAlign="top" align="left" height={26} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />;

function tooltip(unidades: Record<string, string>) {
  return (
    <Tooltip
      labelFormatter={(t) => diaHora(Number(t))}
      formatter={(v, nombre) => [`${n(v as number, nombre === "Dirección" ? 0 : 1)} ${unidades[String(nombre)] ?? ""}`, nombre]}
      contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 10, fontSize: 13 }}
    />
  );
}

export function Panel({ titulo, nota, children }: { titulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <figure className="panel-grafica tarjeta">
      <figcaption>
        <b>{titulo}</b>
        {nota && <small>{nota}</small>}
      </figcaption>
      {children}
    </figure>
  );
}

const ALTO = 220;
const margen = { top: 4, right: 4, bottom: 0, left: -6 };

export function GraficaTempHum({ datos, horas }: { datos: PuntoHistorico[]; horas: number }) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={datos} margin={margen}>
        {rejilla}
        {ejeX(horas)}
        {ejeY({ yAxisId: "t" })}
        {ejeY({ yAxisId: "h", orientation: "right", domain: [0, 100], unit: "%" })}
        {tooltip({ Temperatura: "°C", Rocío: "°C", Humedad: "%" })}
        {leyenda}
        <Area yAxisId="h" dataKey="hum" name="Humedad" stroke="var(--c-hum)" fill="var(--c-hum)" fillOpacity={0.08} strokeWidth={1.2} dot={false} isAnimationActive={false} />
        <Line yAxisId="t" dataKey="rocio" name="Rocío" stroke="var(--c-rocio)" strokeDasharray="4 3" dot={false} strokeWidth={1.4} isAnimationActive={false} />
        <Line yAxisId="t" dataKey="temp" name="Temperatura" stroke="var(--c-temp)" dot={false} strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function GraficaPresion({ datos, horas }: { datos: PuntoHistorico[]; horas: number }) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={datos} margin={margen}>
        {rejilla}
        {ejeX(horas)}
        {ejeY({ width: 58 })}
        {tooltip({ Presión: "hPa" })}
        {leyenda}
        <Area dataKey="presion" name="Presión" stroke="var(--c-presion)" fill="var(--c-presion)" fillOpacity={0.15} strokeWidth={2} dot={false} isAnimationActive={false} baseValue="dataMin" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function GraficaViento({ datos, horas }: { datos: PuntoHistorico[]; horas: number }) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={datos} margin={margen}>
        {rejilla}
        {ejeX(horas)}
        {ejeY({ domain: [0, "auto"] })}
        {tooltip({ "Viento medio": "km/h", Rachas: "km/h" })}
        {leyenda}
        <Scatter dataKey="racha" name="Rachas" fill="var(--c-racha)" shape={<PuntoPequeno />} isAnimationActive={false} />
        <Line dataKey="viento" name="Viento medio" stroke="var(--c-viento)" dot={false} strokeWidth={1.8} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PuntoPequeno(props: any) {
  const { cx, cy, fill } = props;
  if (cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={1.8} fill={fill} />;
}

export function GraficaDireccion({ datos, horas }: { datos: PuntoHistorico[]; horas: number }) {
  // El tamaño del punto crece con la velocidad
  const puntos = datos.filter((d) => d.dir !== null && (d.viento ?? 0) >= 1);
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={puntos} margin={margen}>
        {rejilla}
        {ejeX(horas)}
        {ejeY({
          domain: [0, 360],
          ticks: [0, 90, 180, 270, 360],
          tickFormatter: (v: number) => ({ 0: "N", 90: "E", 180: "S", 270: "O", 360: "N" })[v] ?? "",
        })}
        {tooltip({ Dirección: "°" })}
        {leyenda}
        <Scatter
          dataKey="dir"
          name="Dirección"
          fill="var(--c-viento)"
          isAnimationActive={false}
          shape={(p: any) =>
            p.cx === undefined ? <g /> : <circle cx={p.cx} cy={p.cy} r={1.5 + Math.min(5, (p.payload.viento ?? 0) / 6)} fill="var(--c-viento)" opacity={0.55} />
          }
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function GraficaLluvia({ datos, horas }: { datos: PuntoHistorico[]; horas: number }) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={datos} margin={margen}>
        {rejilla}
        {ejeX(horas)}
        {ejeY({ yAxisId: "a", domain: [0, (m: number) => Math.max(2, Math.ceil(m))] })}
        {ejeY({ yAxisId: "i", orientation: "right", domain: [0, (m: number) => Math.max(2, Math.ceil(m))] })}
        {tooltip({ "Acumulado del día": "mm", Intensidad: "mm/h" })}
        {leyenda}
        <Area yAxisId="a" dataKey="lluvia_dia" name="Acumulado del día" type="stepAfter" stroke="var(--c-lluvia)" fill="var(--c-lluvia)" fillOpacity={0.2} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        <Bar yAxisId="i" dataKey="intensidad" name="Intensidad" fill="var(--c-intensidad)" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function GraficaSol({ datos, horas }: { datos: PuntoHistorico[]; horas: number }) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={datos} margin={margen}>
        {rejilla}
        {ejeX(horas)}
        {ejeY({ yAxisId: "r", domain: [0, (m: number) => Math.max(100, Math.ceil(m / 100) * 100)] })}
        {ejeY({ yAxisId: "u", orientation: "right", domain: [0, (m: number) => Math.max(4, Math.ceil(m))] })}
        {tooltip({ Radiación: "W/m²", "Índice UV": "" })}
        {leyenda}
        <Area yAxisId="r" dataKey="radiacion" name="Radiación" stroke="var(--c-sol)" fill="var(--c-sol)" fillOpacity={0.2} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        <Line yAxisId="u" dataKey="uv" name="Índice UV" type="stepAfter" stroke="var(--c-uv)" dot={false} strokeWidth={1.6} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Temperatura de hoy frente a la de ayer a la misma hora. */
export function GraficaHoyAyer({ datos }: { datos: PuntoHistorico[] }) {
  if (!datos.length) return null;
  const fin = datos[datos.length - 1].t;
  const ayer = new Map(datos.filter((d) => d.t <= fin - 86400).map((d) => [d.t + 86400, d.temp]));
  const serie = datos.filter((d) => d.t > fin - 86400).map((d) => ({ t: d.t, hoy: d.temp, ayer: ayer.get(d.t) ?? null }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={serie} margin={margen}>
        {rejilla}
        {ejeX(24)}
        {ejeY()}
        {tooltip({ "Últimas 24 h": "°C", "Ayer a la misma hora": "°C" })}
        {leyenda}
        <Line dataKey="ayer" name="Ayer a la misma hora" stroke="var(--texto-suave)" strokeDasharray="4 4" dot={false} strokeWidth={1.4} isAnimationActive={false} />
        <Line dataKey="hoy" name="Últimas 24 h" stroke="var(--c-temp)" dot={false} strokeWidth={2.2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Minigráfica de temperatura para la tarjeta principal. */
export function MiniTemp({ datos }: { datos: PuntoHistorico[] }) {
  return (
    <ResponsiveContainer width="100%" height={56}>
      <ComposedChart data={datos} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
        <XAxis hide dataKey="t" type="number" domain={["dataMin", "dataMax"]} />
        <Area dataKey="temp" stroke="var(--acento)" fill="var(--acento)" fillOpacity={0.15} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Colores para distinguir estaciones en la gráfica comparativa. */
export const COLORES_RED = ["#e0592f", "#2b82d9", "#0e9f6e", "#8b49c9", "#e2a017", "#d6336c", "#1aa3b8", "#6b7280", "#7c5c2e", "#4c6ef5"];

/** Temperatura de todas las estaciones de la red (una línea por estación). */
export function GraficaRed({ series, nombres }: { series: Record<string, [number, number | null][]>; nombres: Record<string, string> }) {
  const slugs = Object.keys(series).filter((s) => series[s].length);
  const porT = new Map<number, Record<string, number | null>>();
  for (const s of slugs) for (const [t, v] of series[s]) porT.set(t, { ...(porT.get(t) ?? { t }), [s]: v });
  const datos = [...porT.values()].sort((a, b) => (a.t as number) - (b.t as number));
  if (datos.length < 2) return <p className="vacio">Aún no hay suficientes datos.</p>;
  const unidades = Object.fromEntries(slugs.map((s) => [nombres[s] ?? s, "°C"]));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={datos} margin={margen}>
        {rejilla}
        {ejeX(24)}
        {ejeY()}
        {tooltip(unidades)}
        <Legend verticalAlign="top" align="left" height={30} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        {slugs.map((s, i) => (
          <Line
            key={s}
            dataKey={s}
            name={nombres[s] ?? s}
            stroke={COLORES_RED[i % COLORES_RED.length]}
            dot={false}
            strokeWidth={1.8}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
