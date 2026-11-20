// Gráficas «día a día»: el resumen de cada día (máxima, mínima, media, lluvia, racha…) a lo largo de semanas, meses
// o años. Al pulsar un día se abre en «Consultar un día».
import { useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ResumenDiario, ResumenMes } from "../../shared/tipos";
import { capital, fechaCompleta, n, nombreMes } from "../formato";

/** Un día con sus medias calculadas, listo para las gráficas. */
export interface DiaGrafica extends ResumenDiario {
  temp_media: number | null;
  viento_medio: number | null;
  /** [mín, máx] para las bandas */
  rango_t: [number, number] | null;
  rango_p: [number, number] | null;
  rango_h: [number, number] | null;
  /** Lluvia acumulada desde el primer día del periodo */
  acumulado: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Temperatura media del día: la de todas las lecturas o, si no la hay, (máx + mín) / 2. */
export const mediaTemp = (d: ResumenDiario) =>
  d.temp_n ? r1((d.temp_suma ?? 0) / d.temp_n) : d.tmax !== null && d.tmin !== null ? r1((d.tmax + d.tmin) / 2) : null;

export function prepararDias(dias: ResumenDiario[]): DiaGrafica[] {
  let acumulado = 0;
  return dias.map((d) => {
    acumulado += d.lluvia ?? 0;
    return {
      ...d,
      temp_media: mediaTemp(d),
      viento_medio: d.viento_n ? r1((d.viento_suma ?? 0) / d.viento_n) : null,
      rango_t: d.tmin !== null && d.tmax !== null ? [d.tmin, d.tmax] : null,
      rango_p: d.presion_min !== null && d.presion_max !== null ? [d.presion_min, d.presion_max] : null,
      rango_h: d.hum_min !== null && d.hum_max !== null ? [d.hum_min, d.hum_max] : null,
      acumulado: r1(acumulado),
    };
  });
}

const ALTO = 220;
const margen = { top: 4, right: 4, bottom: 0, left: -6 };
const fmtCorto = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtMesCorto = new Intl.DateTimeFormat("es-ES", { month: "short", year: "numeric", timeZone: "UTC" });
/** En las gráficas por meses, «fecha» es "aaaa-mm" */
const esMes = (f: string) => f.length === 7;
const etiquetaFecha = (f: string) => (esMes(f) ? fmtMesCorto.format(Date.parse(`${f}-15T12:00:00Z`)) : fmtCorto.format(Date.parse(`${f}T12:00:00Z`)));

const ejeX = <XAxis dataKey="fecha" tickFormatter={etiquetaFecha} minTickGap={28} tick={{ className: "eje" }} stroke="var(--borde)" />;
const ejeY = (props: Record<string, unknown> = {}) => <YAxis width={44} tick={{ className: "eje" }} stroke="var(--borde)" domain={["auto", "auto"]} {...props} />;
const rejilla = <CartesianGrid stroke="var(--rejilla)" vertical={false} />;
const leyenda = <Legend verticalAlign="top" align="left" height={26} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />;

/** Globo con el día completo: las bandas se enseñan como «mín – máx». */
function tooltip(unidades: Record<string, string>, decimales: Record<string, number> = {}) {
  return (
    <Tooltip
      labelFormatter={(f) => capital(esMes(String(f)) ? nombreMes(String(f)) : fechaCompleta(String(f)))}
      formatter={(v, nombre) => {
        const d = decimales[String(nombre)] ?? 1;
        const u = unidades[String(nombre)] ?? "";
        return [Array.isArray(v) ? `${n(v[0], d)} – ${n(v[1], d)} ${u}` : `${n(v as number, d)} ${u}`, nombre];
      }}
      contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 10, fontSize: 13 }}
    />
  );
}

interface Props {
  dias: DiaGrafica[];
  /** Al pulsar un día */
  onDia?: (fecha: string) => void;
}

/** Contenedor común: al pulsar en la gráfica se elige el día. */
function Grafica({ dias, onDia, children }: Props & { children: React.ReactNode }) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
      <ComposedChart
        data={dias}
        margin={margen}
        onClick={(s: any) => s?.activeLabel && !esMes(String(s.activeLabel)) && onDia?.(String(s.activeLabel))}
        style={onDia && !esMes(dias[0]?.fecha ?? "") ? { cursor: "pointer" } : undefined}
      >
        {rejilla}
        {ejeX}
        {children}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Los meses como puntos de las gráficas (para «Todo» con años de histórico): la franja va de la media de las mínimas a
 * la de las máximas, la lluvia es la del mes, la racha la máxima del mes…
 */
export function mesesComoDias(meses: ResumenMes[]): DiaGrafica[] {
  let acumulado = 0;
  return meses.map((m) => {
    acumulado += m.lluvia;
    const base: ResumenDiario = {
      fecha: m.mes,
      tmax: m.mediaMax,
      tmax_ts: null,
      tmin: m.mediaMin,
      tmin_ts: null,
      hum_max: m.humMax,
      hum_min: m.humMin,
      presion_max: m.presionMax,
      presion_min: m.presionMin,
      viento_max: null,
      racha_max: m.racha,
      racha_max_ts: null,
      lluvia: m.lluvia,
      intensidad_max: null,
      intensidad_max_ts: null,
      radiacion_max: null,
      uv_max: null,
      lecturas: 0,
      rayos: m.rayos,
      temp_suma: null,
      temp_n: null,
      viento_suma: null,
      viento_n: null,
      origen: null,
    } as ResumenDiario;
    return {
      ...base,
      temp_media: m.media,
      viento_medio: m.vientoMedio,
      rango_t: m.mediaMin !== null && m.mediaMax !== null ? [m.mediaMin, m.mediaMax] : null,
      rango_p: m.presionMin !== null && m.presionMax !== null ? [m.presionMin, m.presionMax] : null,
      rango_h: m.humMin !== null && m.humMax !== null ? [m.humMin, m.humMax] : null,
      acumulado: r1(acumulado),
    };
  });
}

export function DiariaTemp(p: Props) {
  // Escala ajustada a las mínimas y máximas del periodo (la automática se va muy por debajo)
  const v = p.dias.flatMap((d) => [d.tmin, d.tmax]).filter((x): x is number => x !== null);
  const dominio = v.length ? [Math.floor(Math.min(...v) / 5) * 5, Math.ceil(Math.max(...v) / 5) * 5] : ["auto", "auto"];
  return (
    <Grafica {...p}>
      {ejeY({ domain: dominio, allowDecimals: false })}
      {tooltip({ "Mínima – máxima": "°C", Media: "°C" })}
      {leyenda}
      <Area dataKey="rango_t" name="Mínima – máxima" stroke="var(--c-temp)" strokeOpacity={0.5} fill="var(--c-temp)" fillOpacity={0.18} isAnimationActive={false} />
      <Line dataKey="temp_media" name="Media" stroke="var(--c-temp)" dot={false} strokeWidth={2} isAnimationActive={false} />
    </Grafica>
  );
}

export function DiariaLluvia(p: Props) {
  return (
    <Grafica {...p}>
      {ejeY({ yAxisId: "d", domain: [0, (m: number) => Math.max(5, Math.ceil(m))] })}
      {ejeY({ yAxisId: "a", orientation: "right", domain: [0, (m: number) => Math.max(10, Math.ceil(m))] })}
      {tooltip({ "Lluvia del día": "mm", "Lluvia del mes": "mm", Acumulado: "mm" })}
      {leyenda}
      <Bar yAxisId="d" dataKey="lluvia" name={esMes(p.dias[0]?.fecha ?? "") ? "Lluvia del mes" : "Lluvia del día"} fill="var(--c-lluvia)" isAnimationActive={false} />
      <Line yAxisId="a" dataKey="acumulado" name="Acumulado" type="stepAfter" stroke="var(--c-intensidad)" dot={false} strokeWidth={1.8} isAnimationActive={false} />
    </Grafica>
  );
}

export function DiariaViento(p: Props) {
  return (
    <Grafica {...p}>
      {ejeY({ domain: [0, "auto"] })}
      {tooltip({ "Racha máxima": "km/h", "Viento medio máximo": "km/h", "Viento medio del día": "km/h", "Viento medio del mes": "km/h" })}
      {leyenda}
      <Bar dataKey="racha_max" name="Racha máxima" fill="var(--c-racha)" fillOpacity={0.55} isAnimationActive={false} />
      <Line dataKey="viento_max" name="Viento medio máximo" stroke="var(--c-viento)" dot={false} strokeWidth={1.6} isAnimationActive={false} />
      <Line dataKey="viento_medio" name={esMes(p.dias[0]?.fecha ?? "") ? "Viento medio del mes" : "Viento medio del día"} stroke="var(--c-viento)" strokeDasharray="4 3" dot={false} strokeWidth={1.4} isAnimationActive={false} />
    </Grafica>
  );
}

export function DiariaPresion(p: Props) {
  return (
    <Grafica {...p}>
      {ejeY({ width: 58 })}
      {tooltip({ "Mínima – máxima": "hPa" })}
      {leyenda}
      <Area dataKey="rango_p" name="Mínima – máxima" stroke="var(--c-presion)" fill="var(--c-presion)" fillOpacity={0.2} isAnimationActive={false} />
    </Grafica>
  );
}

export function DiariaHumedad(p: Props) {
  return (
    <Grafica {...p}>
      {ejeY({ domain: [0, 100], unit: "%" })}
      {tooltip({ "Mínima – máxima": "%" }, { "Mínima – máxima": 0 })}
      {leyenda}
      <Area dataKey="rango_h" name="Mínima – máxima" stroke="var(--c-hum)" fill="var(--c-hum)" fillOpacity={0.2} isAnimationActive={false} />
    </Grafica>
  );
}

export function DiariaSol(p: Props) {
  return (
    <Grafica {...p}>
      {ejeY({ yAxisId: "r", domain: [0, (m: number) => Math.max(100, Math.ceil(m / 100) * 100)] })}
      {ejeY({ yAxisId: "u", orientation: "right", domain: [0, (m: number) => Math.max(4, Math.ceil(m))] })}
      {tooltip({ "Radiación máxima": "W/m²", "UV máximo": "" }, { "Radiación máxima": 0, "UV máximo": 0 })}
      {leyenda}
      <Bar yAxisId="r" dataKey="radiacion_max" name="Radiación máxima" fill="var(--c-sol)" fillOpacity={0.6} isAnimationActive={false} />
      <Line yAxisId="u" dataKey="uv_max" name="UV máximo" stroke="var(--c-uv)" dot={false} strokeWidth={1.6} isAnimationActive={false} />
    </Grafica>
  );
}

export function DiariaRayos(p: Props) {
  return (
    <Grafica {...p}>
      {ejeY({ allowDecimals: false, domain: [0, "auto"] })}
      {tooltip({ Rayos: "" }, { Rayos: 0 })}
      {leyenda}
      <Bar dataKey="rayos" name="Rayos" fill="var(--c-rayos)" isAnimationActive={false} />
    </Grafica>
  );
}

// ----- Tabla por meses -----

/** Tabla «Mes a mes» de un año (el que se elija; por defecto, el último con datos). */
export function TablaMeses({ meses: todos }: { meses: ResumenMes[] }) {
  const anios = [...new Set(todos.map((m) => m.mes.slice(0, 4)))].sort().reverse();
  const [anio, setAnio] = useState(anios[0] ?? "");
  const meses = todos.filter((m) => m.mes.startsWith(anio)).reverse();
  const conRayos = meses.some((m) => m.rayos !== null);
  return (
    <div className="tarjeta tabla-meses">
      {anios.length > 1 && (
        <label className="tabla-meses-anio">
          Año{" "}
          <select value={anio} onChange={(e) => setAnio(e.target.value)}>
            {anios.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      )}
      <table>
        <thead>
          <tr>
            <th>Mes</th>
            <th title="Media de las máximas">Máx.</th>
            <th title="Media de las mínimas">Mín.</th>
            <th title="Temperatura media">Media</th>
            <th>Lluvia</th>
            <th title="Días con 0,2 mm o más">Días de lluvia</th>
            <th>Racha máx.</th>
            <th title="Días con mínima bajo 0 °C">Heladas</th>
            <th title="Días con máxima de 30 °C o más">Días ≥ 30°</th>
            {conRayos && <th>Rayos</th>}
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.mes}>
              <th>
                {capital(nombreMes(m.mes))}
                <small className="suave"> · {m.dias} d</small>
              </th>
              <td className="calor">{n(m.mediaMax)}°</td>
              <td className="frio">{n(m.mediaMin)}°</td>
              <td>{n(m.media)}°</td>
              <td className="lluvia">{n(m.lluvia)} mm</td>
              <td>{m.diasLluvia}</td>
              <td>{n(m.racha, 0)} km/h</td>
              <td>{m.heladas}</td>
              <td>{m.calor}</td>
              {conRayos && <td>{m.rayos ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
