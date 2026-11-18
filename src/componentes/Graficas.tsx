// Gráficas de evolución de la estación (Recharts): las últimas horas, con un punto cada 5 minutos.
// Todas comparten un «marco»: las marcas del eje (con el día en cada medianoche), una línea en cada medianoche y la
// noche sombreada, para que con varios días se vea de un vistazo qué día y qué hora es cada cosa.
import type { ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PuntoHistorico } from "../../shared/tipos";
import { diaHora, n } from "../formato";
import { solDia } from "../sol";

// ----- Marco común: marcas del eje, medianoches y noches -----

const fmtHoraLocal = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "numeric", hourCycle: "h23" });
const fmtDia = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric" });
const fmtFecha = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
const horaLocal = (t: number) => Number(fmtHoraLocal.format(t * 1000));
const fechaLocal = (t: number) => fmtFecha.format(t * 1000);

export interface Marco {
  horas: number;
  desde: number;
  hasta: number;
  /** Marcas del eje horizontal (horas en punto) */
  ticks: number[];
  /** Medianoches dentro del periodo */
  medianoches: number[];
  /** Noches (de la puesta a la salida del sol) dentro del periodo */
  noches: [number, number][];
}

/** Marco de unas gráficas que van de «desde» a «hasta» (segundos), en lat/lon. */
export function crearMarco(desde: number, hasta: number, horas: number, lat: number, lon: number): Marco {
  const paso = horas <= 24 ? 3 : horas <= 48 ? 6 : horas <= 72 ? 12 : 24;
  const ticks: number[] = [];
  const medianoches: number[] = [];
  for (let t = Math.ceil(desde / 3600) * 3600; t <= hasta; t += 3600) {
    const h = horaLocal(t);
    if (h === 0) medianoches.push(t);
    if (h % paso === 0) ticks.push(t);
  }
  const noches: [number, number][] = [];
  const dias = new Set<string>();
  for (let t = desde - 86400; t <= hasta + 86400; t += 3600 * 6) dias.add(fechaLocal(t));
  const lista = [...dias].sort();
  for (let i = 0; i < lista.length - 1; i++) {
    const hoy = solDia(lista[i], lat, lon);
    const manana = solDia(lista[i + 1], lat, lon);
    if (!hoy || !manana) continue;
    const a = Math.max(hoy.puesta, desde);
    const b = Math.min(manana.salida, hasta);
    if (b > a) noches.push([a, b]);
  }
  return { horas, desde, hasta, ticks, medianoches, noches };
}

const etiquetaTick = (t: number) => (horaLocal(t) === 0 ? fmtDia.format(t * 1000) : `${String(horaLocal(t)).padStart(2, "0")}:00`);

const ejeX = (m: Marco) => (
  <XAxis
    dataKey="t"
    type="number"
    scale="time"
    domain={[m.desde, m.hasta]}
    ticks={m.ticks}
    tickFormatter={etiquetaTick}
    tick={{ className: "eje" }}
    stroke="var(--borde)"
    allowDataOverflow
  />
);

/** Noches sombreadas y una línea en cada medianoche (van detrás de las series). */
function fondo(m: Marco, yAxisId?: string) {
  const eje = yAxisId ? { yAxisId } : {};
  return [
    ...m.noches.map(([a, b]) => <ReferenceArea key={`n${a}`} x1={a} x2={b} {...eje} fill="var(--noche-grafica)" fillOpacity={1} stroke="none" ifOverflow="hidden" />),
    ...m.medianoches.map((t) => <ReferenceLine key={`m${t}`} x={t} {...eje} stroke="var(--borde)" strokeDasharray="3 3" />),
  ];
}

const ejeY = (props: Record<string, unknown> = {}) => (
  <YAxis width={44} tick={{ className: "eje" }} stroke="var(--borde)" domain={["auto", "auto"]} {...props} />
);
const rejilla = <CartesianGrid stroke="var(--rejilla)" vertical={false} />;
const leyenda = <Legend verticalAlign="top" align="left" height={26} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />;

function tooltip(unidades: Record<string, string>, decimales: Record<string, number> = {}) {
  return (
    <Tooltip
      labelFormatter={(t) => diaHora(Number(t))}
      formatter={(v, nombre) => [`${n(v as number, decimales[String(nombre)] ?? (nombre === "Dirección" ? 0 : 1))} ${unidades[String(nombre)] ?? ""}`, nombre]}
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

interface Props {
  datos: PuntoHistorico[];
  marco: Marco;
}

/**
 * Temperatura, rocío y humedad. Con «ayer» (las lecturas de las 24 h anteriores) se dibuja también la temperatura
 * de ayer a la misma hora, en gris, para comparar.
 */
export function GraficaTempHum({ datos, marco, ayer }: Props & { ayer?: PuntoHistorico[] }) {
  const deAyer = new Map((ayer ?? []).map((p) => [p.t + 86400, p.temp]));
  const serie = ayer?.length ? datos.map((p) => ({ ...p, ayer: deAyer.get(p.t) ?? null })) : datos;
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={serie} margin={margen}>
        {fondo(marco, "t")}
        {rejilla}
        {ejeX(marco)}
        {ejeY({ yAxisId: "t" })}
        {ejeY({ yAxisId: "h", orientation: "right", domain: [0, 100], unit: "%" })}
        {tooltip({ Temperatura: "°C", Rocío: "°C", Humedad: "%", "Ayer a esta hora": "°C" }, { Humedad: 0 })}
        {leyenda}
        <Area yAxisId="h" dataKey="hum" name="Humedad" stroke="var(--c-hum)" fill="var(--c-hum)" fillOpacity={0.08} strokeWidth={1.2} dot={false} isAnimationActive={false} />
        <Line yAxisId="t" dataKey="rocio" name="Rocío" stroke="var(--c-rocio)" strokeDasharray="4 3" dot={false} strokeWidth={1.4} isAnimationActive={false} />
        {ayer?.length ? (
          <Line yAxisId="t" dataKey="ayer" name="Ayer a esta hora" stroke="var(--texto-suave)" strokeOpacity={0.7} dot={false} strokeWidth={1.6} connectNulls isAnimationActive={false} />
        ) : null}
        <Line yAxisId="t" dataKey="temp" name="Temperatura" stroke="var(--c-temp)" dot={false} strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function GraficaPresion({ datos, marco }: Props) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={datos} margin={margen}>
        {fondo(marco)}
        {rejilla}
        {ejeX(marco)}
        {ejeY({ width: 58 })}
        {tooltip({ Presión: "hPa" })}
        {leyenda}
        <Area dataKey="presion" name="Presión" stroke="var(--c-presion)" fill="var(--c-presion)" fillOpacity={0.15} strokeWidth={2} dot={false} isAnimationActive={false} baseValue="dataMin" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function GraficaViento({ datos, marco }: Props) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={datos} margin={margen}>
        {fondo(marco)}
        {rejilla}
        {ejeX(marco)}
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

export function GraficaDireccion({ datos, marco }: Props) {
  // El tamaño del punto crece con la velocidad
  const puntos = datos.filter((d) => d.dir !== null && (d.viento ?? 0) >= 1);
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={puntos} margin={margen}>
        {fondo(marco)}
        {rejilla}
        {ejeX(marco)}
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

export function GraficaLluvia({ datos, marco }: Props) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={datos} margin={margen}>
        {fondo(marco, "a")}
        {rejilla}
        {ejeX(marco)}
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

export function GraficaSol({ datos, marco }: Props) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={datos} margin={margen}>
        {fondo(marco, "r")}
        {rejilla}
        {ejeX(marco)}
        {ejeY({ yAxisId: "r", domain: [0, (m: number) => Math.max(100, Math.ceil(m / 100) * 100)] })}
        {ejeY({ yAxisId: "u", orientation: "right", domain: [0, (m: number) => Math.max(4, Math.ceil(m))] })}
        {tooltip({ Radiación: "W/m²", "Índice UV": "" }, { Radiación: 0, "Índice UV": 0 })}
        {leyenda}
        <Area yAxisId="r" dataKey="radiacion" name="Radiación" stroke="var(--c-sol)" fill="var(--c-sol)" fillOpacity={0.2} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        <Line yAxisId="u" dataKey="uv" name="Índice UV" type="stepAfter" stroke="var(--c-uv)" dot={false} strokeWidth={1.6} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Rayos: el contador del día (sube con cada rayo) y la distancia del último. */
export function GraficaRayos({ datos, marco }: Props) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart data={datos} margin={margen}>
        {fondo(marco, "n")}
        {rejilla}
        {ejeX(marco)}
        {ejeY({ yAxisId: "n", domain: [0, (m: number) => Math.max(5, Math.ceil(m))], allowDecimals: false })}
        {ejeY({ yAxisId: "d", orientation: "right", domain: [0, 40], unit: " km" })}
        {tooltip({ "Rayos del día": "", "Distancia del último": "km" }, { "Rayos del día": 0, "Distancia del último": 0 })}
        {leyenda}
        <Area yAxisId="n" dataKey="rayos" name="Rayos del día" type="stepAfter" stroke="var(--c-rayos)" fill="var(--c-rayos)" fillOpacity={0.15} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        <Scatter yAxisId="d" dataKey="rayos_dist" name="Distancia del último" fill="var(--c-racha)" shape={<PuntoPequeno />} isAnimationActive={false} />
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
  const ts = datos.map((d) => d.t as number);
  const marco = crearMarco(Math.min(...ts), Math.max(...ts), 24, 40.28, -1.16);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={datos} margin={margen}>
        {fondo(marco)}
        {rejilla}
        {ejeX(marco)}
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
