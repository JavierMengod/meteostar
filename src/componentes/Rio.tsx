// Caudal estimado del Turia en Villastar (modelo GloFAS de Copernicus vía Open-Meteo).
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DiaRio, RespuestaRio } from "../../shared/tipos";
import { usePeticion } from "../datos";
import { diaSemana, fechaCorta, n } from "../formato";

/** Cómo va el río comparado con lo normal para la época. */
export function estadoCaudal(d: DiaRio): { texto: string; clase: string } {
  if (d.caudal === null || d.normal === null) return { texto: "Sin dato", clase: "estable" };
  if (d.alto !== null && d.caudal > d.alto) return { texto: "Muy por encima de lo normal", clase: "alto" };
  const r = d.normal > 0 ? d.caudal / d.normal : 1;
  if (r >= 1.5) return { texto: `Unas ${n(r, 0)} veces lo normal para la época`, clase: "sube" };
  if (r <= 0.6) return { texto: "Por debajo de lo normal para la época", clase: "baja" };
  return { texto: "Normal para la época", clase: "estable" };
}

function Grafica({ dias }: { dias: DiaRio[] }) {
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
        <YAxis width={44} tick={{ className: "eje" }} stroke="var(--borde)" domain={[0, "auto"]} />
        <Tooltip
          labelFormatter={(f) => `${diaSemana(String(f))} ${fechaCorta(String(f))}`}
          formatter={(v, nombre) => [Array.isArray(v) ? `${n(v[0])}–${n(v[1])} m³/s` : `${n(v as number)} m³/s`, nombre]}
          contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 10, fontSize: 13 }}
        />
        <Legend verticalAlign="top" align="left" height={26} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        {ultimoPasado && <ReferenceLine x={ultimoPasado} stroke="var(--texto-suave)" strokeDasharray="2 3" />}
        <Area dataKey="rango" name="Rango de la previsión" stroke="none" fill="var(--c-lluvia)" fillOpacity={0.18} isAnimationActive={false} />
        <Line dataKey="normal" name="Normal para la época" stroke="var(--texto-suave)" strokeDasharray="4 4" dot={false} strokeWidth={1.4} isAnimationActive={false} />
        <Line dataKey="pasado" name="Caudal estimado" stroke="var(--c-lluvia)" dot={false} strokeWidth={2.2} isAnimationActive={false} />
        <Line dataKey="prevista" name="Previsión" stroke="var(--c-lluvia)" strokeDasharray="5 4" dot={false} strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function Rio() {
  const { datos, error } = usePeticion<RespuestaRio>("/api/rio", 60 * 60_000);
  if (!datos) return error ? <p className="vacio">El caudal estimado no está disponible ahora mismo.</p> : <div className="tarjeta rio" style={{ minHeight: 320 }} />;
  const a = datos.actual;
  const estado = a ? estadoCaudal(a) : null;
  return (
    <section className="tarjeta rio">
      <div className="rio-resumen">
        <div>
          <small className="mono">CAUDAL ESTIMADO HOY</small>
          <p className="numero-grande">
            {n(a?.caudal ?? null)}
            <sup>m³/s</sup>
          </p>
          {estado && <span className={`variacion ${estado.clase}`}>{estado.texto}</span>}
          {a?.normal !== null && a?.normal !== undefined && <p className="suave pequeno">Lo normal estos días: {n(a.normal)} m³/s</p>}
        </div>
        {datos.aviso && (
          <p className={`aviso-rio ${datos.aviso.nivel}`}>
            <b>{datos.aviso.nivel === "probable" ? "Crecida probable" : "Posible crecida"}</b> a partir del {diaSemana(datos.aviso.fecha)}{" "}
            {fechaCorta(datos.aviso.fecha)}: hasta {n(datos.aviso.caudal)} m³/s
            {datos.aviso.nivel === "posible" && " en el escenario más lluvioso"}.
          </p>
        )}
      </div>
      <Grafica dias={datos.dias} />
      <p className="suave pequeno nota-rio">
        Estimación diaria del modelo hidrológico GloFAS (Copernicus), no una medición: calcula el caudal a partir de la lluvia y el terreno, y puede no
        reflejar bien lo que suelta el embalse de Arquillo. «Normal» es la mediana de esta época del año desde {datos.desde?.slice(0, 4) ?? "1997"}.
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
