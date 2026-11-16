// Página de un embalse: estado, comparativas con otros años, gráfica del histórico, tabla y descarga.
import { lazy, Suspense, useState } from "react";
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DetalleEmbalse, SemanaEmbalse } from "../../shared/tipos";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import { usePeticion } from "../datos";
import { conSigno, fechaCompleta, fechaCorta, hora, n, nombreMes } from "../formato";
import { colorEmbalse } from "../embalses";

const Mapa = lazy(() => import("../componentes/Mapa"));

const RANGOS: [number, string][] = [
  [53, "1 año"],
  [157, "3 años"],
  [0, "Todo"],
];

const mesAnio = (fecha: string) => nombreMes(fecha.slice(0, 7)).replace(" de ", " ");

function Comparacion({ titulo, semana, actual, nota }: { titulo: string; semana: { volumen: number | null; porcentaje: number | null } | null; actual: number | null; nota?: string }) {
  if (!semana || semana.volumen === null) return null;
  const diferencia = actual !== null ? actual - semana.volumen : null;
  return (
    <div className="tarjeta comparacion">
      <small className="mono">{titulo.toUpperCase()}</small>
      <b>
        {n(semana.volumen, 0)} <span>hm³</span>
      </b>
      <span className="suave">
        {n(semana.porcentaje)} %{nota && ` · ${nota}`}
      </span>
      {diferencia !== null && (
        <span className={diferencia > 0 ? "variacion sube" : diferencia < 0 ? "variacion baja" : "variacion"}>
          {diferencia === 0 ? "Igual que ahora" : `Ahora hay ${n(Math.abs(diferencia), 0)} hm³ ${diferencia > 0 ? "más" : "menos"}`}
        </span>
      )}
    </div>
  );
}

function descargarCsv(e: DetalleEmbalse) {
  const filas = [["fecha", "volumen_hm3", "porcentaje", "variacion_semanal_hm3"], ...e.historico.map((s) => [s.fecha, s.volumen ?? "", s.porcentaje ?? "", s.variacion ?? ""])];
  const texto = `# ${e.nombre} · Datos procesados por MapasDeEmbalses.es · Fuente original: MITECO\n${filas.map((f) => f.join(",")).join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `embalse-${e.slug}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EmbalseDetalle({ slug }: { slug: string }) {
  const { datos: e, error } = usePeticion<DetalleEmbalse>(`/api/embalses/${encodeURIComponent(slug)}`, 30 * 60_000);
  const [semanas, setSemanas] = useState(157);
  if (error === "no encontrado") {
    return (
      <p className="vacio">
        No se ha encontrado este embalse. <a href="/embalses">Volver a los embalses</a>
      </p>
    );
  }
  if (!e) return <Cargando error={error} />;
  const color = colorEmbalse(e.porcentaje);
  const serie = (semanas ? e.historico.slice(-semanas) : e.historico).map((s) => ({ ...s, t: Date.parse(`${s.fecha}T12:00:00Z`) }));
  const ultimas = [...e.historico].reverse().slice(0, 12);

  return (
    <>
      <div className="titulo-pagina">
        <a href="/embalses" className="pequeno">
          ‹ Embalses
        </a>
        <h1>Embalse de {e.nombre}</h1>
        <p className="suave">
          {e.rio && `Río ${e.rio} · `}
          {e.municipio && `${e.municipio} · `}
          {e.provincia} · cuenca del {e.cuenca}
        </p>
      </div>

      <div className="rejilla-embalse">
        <section className="tarjeta estado-embalse">
          <small className="mono">VOLUMEN EMBALSADO · {e.fecha ? fechaCorta(e.fecha, true).toUpperCase() : "—"}</small>
          <p className="numero-enorme" style={{ color }}>
            {n(e.porcentaje)}
            <sup>%</sup>
          </p>
          <div className="barra-embalse grande">
            <i style={{ width: `${Math.min(100, e.porcentaje ?? 0)}%`, background: color }} />
          </div>
          <p>
            <b>{n(e.volumen, 0)} hm³</b> <span className="suave">de {n(e.capacidad, 0)} hm³ de capacidad</span>
          </p>
          {e.variacion !== null && (
            <p className={e.variacion > 0 ? "variacion sube" : e.variacion < 0 ? "variacion baja" : "variacion"}>
              {e.variacion > 0 ? "▲" : e.variacion < 0 ? "▼" : "●"} {conSigno(e.variacion)} hm³ respecto a la semana anterior
            </p>
          )}
          {e.reciente && (
            <p className="reciente-embalse">
              <span className="mono">{e.reciente.fuente}</span> · {fechaCorta(new Date(e.reciente.ts * 1000).toISOString().slice(0, 10))} {hora(e.reciente.ts)}:{" "}
              <b>{n(e.reciente.volumen)} hm³</b>
              {e.reciente.porcentaje !== null && ` (${n(e.reciente.porcentaje)} %)`}
              {e.reciente.nivel !== null && ` · cota ${n(e.reciente.nivel, 2)} m`}
            </p>
          )}
        </section>
        <div className="comparaciones">
          <Comparacion titulo="Hace un año" semana={e.haceUnAnio} actual={e.volumen} nota={e.haceUnAnio ? fechaCorta(e.haceUnAnio.fecha, true) : undefined} />
          <Comparacion
            titulo="Media de esta semana"
            semana={e.mediaSemana}
            actual={e.volumen}
            nota={e.mediaSemana ? `${e.mediaSemana.anios} ${e.mediaSemana.anios === 1 ? "año" : "años"} anteriores` : undefined}
          />
          {e.maximo && (
            <div className="tarjeta comparacion">
              <small className="mono">MÁXIMO DEL HISTÓRICO</small>
              <b>
                {n(e.maximo.volumen, 0)} <span>hm³</span>
              </b>
              <span className="suave">{mesAnio(e.maximo.fecha)}</span>
            </div>
          )}
          {e.minimo && (
            <div className="tarjeta comparacion">
              <small className="mono">MÍNIMO DEL HISTÓRICO</small>
              <b>
                {n(e.minimo.volumen, 0)} <span>hm³</span>
              </b>
              <span className="suave">{mesAnio(e.minimo.fecha)}</span>
            </div>
          )}
        </div>
      </div>

      <CabeceraSeccion titulo="Evolución" nota={e.desde ? `Datos semanales desde el ${fechaCompleta(e.desde)}` : undefined} />
      <div className="periodos" role="tablist">
        {RANGOS.map(([v, t]) => (
          <button key={t} role="tab" aria-selected={semanas === v} onClick={() => setSemanas(v)}>
            {t}
          </button>
        ))}
      </div>
      <figure className="tarjeta panel-grafica">
        <figcaption>
          <b>Volumen embalsado</b>
          <small>hm³ · la línea discontinua es la capacidad</small>
        </figcaption>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid stroke="var(--rejilla)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) => fechaCorta(new Date(t).toISOString().slice(0, 10), semanas !== 53)}
              minTickGap={50}
              tick={{ className: "eje" }}
              stroke="var(--borde)"
            />
            <YAxis width={44} domain={[0, (m: number) => Math.max(m, e.capacidad ?? m)]} tick={{ className: "eje" }} stroke="var(--borde)" />
            <Tooltip
              labelFormatter={(t) => fechaCompleta(new Date(Number(t)).toISOString().slice(0, 10))}
              formatter={(v, nombre, item) =>
                nombre === "Volumen" ? [`${n(v as number, 0)} hm³ (${n((item.payload as SemanaEmbalse).porcentaje)} %)`, nombre] : [`${n(v as number, 0)}`, nombre]
              }
              contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 10, fontSize: 13 }}
            />
            {e.capacidad && <ReferenceLine y={e.capacidad} stroke="var(--texto-suave)" strokeDasharray="5 4" />}
            <Area dataKey="volumen" name="Volumen" stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2} dot={false} isAnimationActive={false} type="monotone" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </figure>

      <div className="rejilla-2 seccion">
        <section className="tarjeta">
          <h3>Últimas semanas</h3>
          <table className="tabla-embalse">
            <thead>
              <tr>
                <th>Semana</th>
                <th>Volumen</th>
                <th>%</th>
                <th>Cambio</th>
              </tr>
            </thead>
            <tbody>
              {ultimas.map((s) => (
                <tr key={s.fecha}>
                  <td>{fechaCorta(s.fecha, true)}</td>
                  <td>{n(s.volumen, 0)} hm³</td>
                  <td>{n(s.porcentaje)}</td>
                  <td className={s.variacion && s.variacion > 0 ? "sube" : s.variacion && s.variacion < 0 ? "baja" : ""}>{s.variacion === null ? "—" : conSigno(s.variacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="boton-secundario" onClick={() => descargarCsv(e)}>
            Descargar todo el histórico (CSV)
          </button>
        </section>
        <section className="tarjeta">
          <h3>Ficha</h3>
          <dl className="lista-datos">
            <div>
              <dt>Capacidad</dt>
              <dd>{n(e.capacidad, 0)} hm³</dd>
            </div>
            {e.rio && (
              <div>
                <dt>Río</dt>
                <dd>{e.rio}</dd>
              </div>
            )}
            <div>
              <dt>Cuenca</dt>
              <dd>{e.cuenca}</dd>
            </div>
            <div>
              <dt>Provincia</dt>
              <dd>{e.provincia}</dd>
            </div>
            {e.anioConstruccion && (
              <div>
                <dt>Construido</dt>
                <dd>{e.anioConstruccion}</dd>
              </div>
            )}
            {e.uso && (
              <div>
                <dt>Uso principal</dt>
                <dd>{e.uso}</dd>
              </div>
            )}
          </dl>
          {e.lat !== null && e.lon !== null && (
            <Suspense fallback={<div className="mapa" style={{ height: 240 }} />}>
              <Mapa alto={240} puntos={[{ lat: e.lat, lon: e.lon, nombre: e.nombre, valor: null, etiqueta: `${n(e.porcentaje, 0)} %`, href: `/embalses/${e.slug}`, color }]} />
            </Suspense>
          )}
        </section>
      </div>

      <p className="nota-fuente seccion">
        Datos procesados por{" "}
        <a href={e.url} target="_blank" rel="noreferrer">
          MapasDeEmbalses.es
        </a>{" "}
        · Fuente original: MITECO (boletín hidrológico semanal)
        {e.reciente && ` y ${e.reciente.fuente} (dato reciente provisional, no contrastado)`}.
      </p>
    </>
  );
}
