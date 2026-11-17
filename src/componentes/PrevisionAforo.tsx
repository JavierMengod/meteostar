// Previsión del caudal de un aforo a 15 días (modelo GloFAS de Copernicus, corregido con el histórico del aforo si lo hay).
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DiaRio, RespuestaRio } from "../../shared/tipos";
import { usePeticion } from "../datos";
import { mensajePrevision } from "../rios";
import { diaSemana, fechaCorta, n } from "../formato";

function Grafica({ dias, corregida }: { dias: DiaRio[]; corregida: boolean }) {
  const ultimoPasado = dias.filter((d) => !d.prevision).at(-1)?.fecha;
  const datos = dias.map((d) => ({
    fecha: d.fecha,
    pasado: !d.prevision ? d.caudal : null,
    // La previsión arranca en el último día pasado para que la línea no quede cortada
    prevista: d.prevision || d.fecha === ultimoPasado ? d.caudal : null,
    rango: d.prevision && d.minimo !== null && d.maximo !== null ? [d.minimo, d.maximo] : null,
    normal: d.normal,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={datos} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="var(--rejilla)" vertical={false} />
        <XAxis dataKey="fecha" tickFormatter={(f: string) => fechaCorta(f)} minTickGap={40} tick={{ className: "eje" }} stroke="var(--borde)" />
        <YAxis width={44} tick={corregida ? { className: "eje" } : false} stroke="var(--borde)" domain={[0, "auto"]} />
        <Tooltip
          labelFormatter={(f) => `${diaSemana(String(f))} ${fechaCorta(String(f))}`}
          formatter={(v, nombre) => [
            corregida ? (Array.isArray(v) ? `${n(v[0], 2)}–${n(v[1], 2)} m³/s` : `${n(v as number, 2)} m³/s`) : "según el modelo",
            nombre,
          ]}
          contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 10, fontSize: 13 }}
        />
        <Legend verticalAlign="top" align="left" height={26} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        {ultimoPasado && <ReferenceLine x={ultimoPasado} stroke="var(--texto-suave)" strokeDasharray="2 3" label={{ value: "Hoy", fontSize: 11, position: "insideTopRight" }} />}
        <Area dataKey="rango" name="La mitad de los escenarios" stroke="none" fill="var(--c-lluvia)" fillOpacity={0.16} isAnimationActive={false} />
        <Line dataKey="normal" name="Normal para la época" stroke="var(--texto-suave)" strokeDasharray="4 4" dot={false} strokeWidth={1.3} isAnimationActive={false} />
        <Line dataKey="pasado" name={corregida ? "Medido" : "Modelo"} stroke="var(--c-lluvia)" dot={false} strokeWidth={2.2} isAnimationActive={false} />
        <Line dataKey="prevista" name="Lo más probable" stroke="var(--c-lluvia)" strokeDasharray="5 4" dot={false} strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function PrevisionAforo({ slug }: { slug: string }) {
  const { datos, error } = usePeticion<RespuestaRio>(`/api/aforos/${slug}/prevision`, 60 * 60_000);
  if (!datos) return error ? <p className="vacio">La previsión no está disponible ahora mismo.</p> : <div className="tarjeta rio" style={{ minHeight: 320 }} />;
  const m = mensajePrevision(datos);
  return (
    <section className="tarjeta rio">
      {m && (
        <div className="rio-resumen">
          <div>
            <small className="mono">PRÓXIMOS 7 DÍAS</small>
            <p className={`estado-modelo ${m.clase}`}>{m.titulo}</p>
            {m.detalle && <p className="suave">{m.detalle}</p>}
          </div>
        </div>
      )}
      <Grafica dias={datos.dias} corregida={datos.corregida} />
      <p className="suave pequeno nota-rio">
        {datos.corregida
          ? "Modelo hidrológico GloFAS (Copernicus) corregido con el histórico del aforo: sus cifras se ajustan a lo que mide el aforo en cada época del año y la previsión arranca en el último caudal medido. Es una previsión, con más incertidumbre cuanto más lejana."
          : "Modelo hidrológico GloFAS (Copernicus). Este aforo no tiene histórico con el que corregirlo, así que sus cifras pueden diferir mucho del caudal medido: sirve para ver la tendencia y si se espera una crecida."}{" "}
        Datos de{" "}
        <a href="https://open-meteo.com/en/docs/flood-api" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        y{" "}
        <a href="https://global-flood.emergency.copernicus.eu/" target="_blank" rel="noreferrer">
          Copernicus GloFAS
        </a>{" "}
        (CC BY 4.0).
      </p>
    </section>
  );
}
