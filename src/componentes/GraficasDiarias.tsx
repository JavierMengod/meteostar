// Gráficas «día a día»: el resumen de cada día (máxima, mínima, media, lluvia, racha…) a lo largo de semanas, meses
// o años. Al pulsar un día se abre en «Consultar un día».
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
import type { ResumenDiario } from "../../shared/tipos";
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
const etiquetaFecha = (f: string) => fmtCorto.format(Date.parse(`${f}T12:00:00Z`));

const ejeX = <XAxis dataKey="fecha" tickFormatter={etiquetaFecha} minTickGap={28} tick={{ className: "eje" }} stroke="var(--borde)" />;
const ejeY = (props: Record<string, unknown> = {}) => <YAxis width={44} tick={{ className: "eje" }} stroke="var(--borde)" domain={["auto", "auto"]} {...props} />;
const rejilla = <CartesianGrid stroke="var(--rejilla)" vertical={false} />;
const leyenda = <Legend verticalAlign="top" align="left" height={26} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />;

/** Globo con el día completo: las bandas se enseñan como «mín – máx». */
function tooltip(unidades: Record<string, string>, decimales: Record<string, number> = {}) {
  return (
    <Tooltip
      labelFormatter={(f) => capital(fechaCompleta(String(f)))}
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
        onClick={(s: any) => s?.activeLabel && onDia?.(String(s.activeLabel))}
        style={onDia ? { cursor: "pointer" } : undefined}
      >
        {rejilla}
        {ejeX}
        {children}
      </ComposedChart>
    </ResponsiveContainer>
  );
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
      {tooltip({ "Lluvia del día": "mm", Acumulado: "mm" })}
      {leyenda}
      <Bar yAxisId="d" dataKey="lluvia" name="Lluvia del día" fill="var(--c-lluvia)" isAnimationActive={false} />
      <Line yAxisId="a" dataKey="acumulado" name="Acumulado" type="stepAfter" stroke="var(--c-intensidad)" dot={false} strokeWidth={1.8} isAnimationActive={false} />
    </Grafica>
  );
}

export function DiariaViento(p: Props) {
  return (
    <Grafica {...p}>
      {ejeY({ domain: [0, "auto"] })}
      {tooltip({ "Racha máxima": "km/h", "Viento medio máximo": "km/h", "Viento medio del día": "km/h" })}
      {leyenda}
      <Bar dataKey="racha_max" name="Racha máxima" fill="var(--c-racha)" fillOpacity={0.55} isAnimationActive={false} />
      <Line dataKey="viento_max" name="Viento medio máximo" stroke="var(--c-viento)" dot={false} strokeWidth={1.6} isAnimationActive={false} />
      <Line dataKey="viento_medio" name="Viento medio del día" stroke="var(--c-viento)" strokeDasharray="4 3" dot={false} strokeWidth={1.4} isAnimationActive={false} />
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

interface Mes {
  mes: string;
  dias: number;
  mediaMax: number | null;
  mediaMin: number | null;
  media: number | null;
  lluvia: number;
  diasLluvia: number;
  racha: number | null;
  heladas: number;
  calor: number;
  rayos: number | null;
}

const media = (v: (number | null)[]) => {
  const x = v.filter((y): y is number => y !== null);
  return x.length ? r1(x.reduce((a, b) => a + b, 0) / x.length) : null;
};

export function resumenMeses(dias: ResumenDiario[]): Mes[] {
  const porMes = new Map<string, ResumenDiario[]>();
  for (const d of dias) porMes.set(d.fecha.slice(0, 7), [...(porMes.get(d.fecha.slice(0, 7)) ?? []), d]);
  return [...porMes.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([mes, l]) => {
      const rachas = l.map((d) => d.racha_max).filter((v): v is number => v !== null);
      const rayos = l.map((d) => d.rayos).filter((v): v is number => v !== null && v !== undefined);
      return {
        mes,
        dias: l.length,
        mediaMax: media(l.map((d) => d.tmax)),
        mediaMin: media(l.map((d) => d.tmin)),
        media: media(l.map(mediaTemp)),
        lluvia: r1(l.reduce((s, d) => s + (d.lluvia ?? 0), 0)),
        diasLluvia: l.filter((d) => (d.lluvia ?? 0) >= 0.2).length,
        racha: rachas.length ? Math.max(...rachas) : null,
        heladas: l.filter((d) => d.tmin !== null && d.tmin < 0).length,
        calor: l.filter((d) => d.tmax !== null && d.tmax >= 30).length,
        rayos: rayos.length ? rayos.reduce((a, b) => a + b, 0) : null,
      };
    });
}

export function TablaMeses({ dias }: { dias: ResumenDiario[] }) {
  const meses = resumenMeses(dias);
  const conRayos = meses.some((m) => m.rayos !== null);
  return (
    <div className="tarjeta tabla-meses">
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
