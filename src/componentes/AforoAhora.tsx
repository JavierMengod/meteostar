// Caudal medido de un aforo: situación, evolución (48 h, 7 o 30 días) y la lluvia de la estación de Meteostar más cercana.
import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DetalleAforo } from "../../shared/tipos";
import { diaHora, hace, hora, n } from "../formato";
import { HORAS_ANTIGUO, NOMBRES_AVISO, situacionAforo, textoTendencia } from "../rios";

const PERIODOS: [number, string][] = [
  [48, "48 h"],
  [24 * 7, "7 días"],
  [24 * 30, "30 días"],
];
const MARGEN = { top: 4, right: 4, bottom: 0, left: -6 };
const tooltipEstilo = { background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 10, fontSize: 13 };

/** Marcas del eje: horas para 48 h; un día (o cada 5 días) a medianoche para periodos largos. */
function marcas(t0: number, t1: number, horas: number): number[] | undefined {
  if (horas <= 48) return undefined;
  const d = new Date(t0 * 1000);
  d.setHours(24, 0, 0, 0);
  const paso = horas > 24 * 10 ? 5 : 1;
  const out: number[] = [];
  for (let t = d.getTime() / 1000; t <= t1; t += 86400 * paso) out.push(t);
  return out;
}

export default function AforoAhora({ a }: { a: DetalleAforo }) {
  const [horas, setHoras] = useState(24 * 7);
  const s = situacionAforo(a);
  const t = textoTendencia(a.tendencia);
  const ahora = Math.floor(Date.now() / 1000);
  const desde = ahora - horas * 3600;

  // Algunos aforos solo publican el nivel: entonces se muestra el nivel en metros
  const soloNivel = !a.serie.some((p) => p[1] !== null) && a.serie.some((p) => p[2] !== null);
  const columna = soloNivel ? 2 : 1;
  const unidad = soloNivel ? "m" : "m³/s";
  const datos = a.serie.filter((p) => p[0] >= desde && p[columna] !== null).map((p) => ({ t: p[0], caudal: p[columna] }));
  const t0 = datos[0]?.t ?? desde;
  const t1 = datos.at(-1)?.t ?? ahora;
  const ticks = marcas(t0, t1, horas);
  const maximo = Math.max(0, ...datos.map((d) => d.caudal ?? 0));
  // Los umbrales solo se dibujan si el río se acerca a ellos; si no, aplastarían la gráfica
  const umbrales = soloNivel ? [] : a.umbrales.filter((u) => u <= maximo * 1.6);
  const lluvia = (a.lluvia?.dias ?? [])
    .map(([f, mm]) => ({ t: Date.parse(`${f}T12:00:00`) / 1000, lluvia: mm }))
    .filter((d) => d.t >= t0 - 43200 && d.t <= t1 + 43200);
  const hayLluvia = lluvia.some((d) => (d.lluvia ?? 0) > 0);
  const corto = datos.length > 0 && datos[0].t > desde + 12 * 3600;
  const eje = (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={[t0, t1]}
      ticks={ticks}
      tickFormatter={(x: number) => (horas > 48 ? diaHora(x).split(",")[0] : hora(x))}
      minTickGap={40}
      tick={{ className: "eje" }}
      stroke="var(--borde)"
    />
  );

  // Aforo que no publica nada: se explica en lugar de dejar la tarjeta vacía
  if (s.estado === "sin-datos") {
    return (
      <section className="tarjeta rio aforo-sin-datos">
        <small className="mono">SIN DATOS</small>
        <p className="estado-modelo">Este aforo no está publicando datos ahora mismo</p>
        <p className="suave">
          El Observatorio del Agua no tiene lecturas suyas de los últimos 7 días: puede estar fuera de servicio, en obras o averiado. En cuanto vuelva a
          publicar, aparecerán aquí solas. Mientras tanto, la previsión de abajo da una idea de cómo va el río.
        </p>
        <p className="suave pequeno">
          <a href="https://observatorioagua.miteco.es/hidrologia/" target="_blank" rel="noreferrer">
            Ver el aforo en el Observatorio del Agua
          </a>
        </p>
      </section>
    );
  }

  return (
    <section className="tarjeta rio">
      {s.estado === "antiguo" && a.ultimo && (
        <p className="aviso-datos">
          Sin datos recientes: la última lectura es de hace {Math.round((ahora - a.ultimo.t) / 3600)} horas (más de {HORAS_ANTIGUO} h). El aforo puede estar
          parado o con retraso.
        </p>
      )}
      <div className="rio-resumen">
        <div>
          <small className="mono">{soloNivel ? "NIVEL MEDIDO" : "CAUDAL MEDIDO"}</small>
          <p className="numero-grande">
            {soloNivel ? n(a.ultimo?.nivel ?? null, 2) : s.caudal === null ? "—" : n(s.caudal, 2)}
            <sup>{unidad}</sup>
          </p>
          {soloNivel && <p className="suave pequeno">Este aforo solo publica el nivel del agua, no el caudal.</p>}
          {s.sinAgua && (
            <p className="sin-agua">
              {soloNivel && (a.ultimo?.nivel ?? 0) < 0
                ? "Sin agua: el nivel está por debajo del cero de la escala, el cauce está seco."
                : "Sin agua: el cauce está seco o casi seco."}
            </p>
          )}
          {t && <span className={`variacion ${t.clase}`}>{`${t.flecha} ${t.texto}`}</span>}
          {s.normal && a.normalHoy && (
            <p className="frente-normal">
              <span className={`variacion ${s.normal.clase}`}>{s.normal.texto}</span>{" "}
              <span className="suave pequeno">(lo habitual estos días: {n(a.normalHoy[2], 2)} m³/s)</span>
            </p>
          )}
          <p className="suave pequeno">
            {!soloNivel && a.ultimo?.nivel != null && `Nivel ${n(a.ultimo.nivel, 2)} m · `}
            {a.ultimo ? `lectura de las ${hora(a.ultimo.t)} (${hace(ahora - a.ultimo.t)})` : "sin lecturas"}
          </p>
        </div>
        <div className="rio-situacion">
          {s.textoAviso && <span className={`insignia-aviso ${s.aviso >= 0 ? `aviso-${s.aviso + 1}` : ""}`}>{s.textoAviso}</span>}
          {s.siguienteAviso && <small className="suave">{s.siguienteAviso}</small>}
        </div>
      </div>

      <div className="periodos" role="tablist">
        {PERIODOS.map(([h, txt]) => (
          <button key={h} role="tab" aria-selected={horas === h} onClick={() => setHoras(h)}>
            {txt}
          </button>
        ))}
      </div>
      {corto && (
        <p className="suave pequeno aviso-corto">
          Por ahora hay lecturas desde el {diaHora(datos[0].t).split(",")[0]}: Meteostar las va guardando y el histórico se completará solo.
        </p>
      )}
      {datos.length < 2 ? (
        <p className="vacio">Aún no hay lecturas suficientes para este periodo.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={datos} margin={MARGEN}>
              <CartesianGrid stroke="var(--rejilla)" vertical={false} />
              {eje}
              <YAxis width={44} tick={{ className: "eje" }} stroke="var(--borde)" domain={soloNivel ? ["auto", "auto"] : [0, "auto"]} />
              <Tooltip labelFormatter={(x) => diaHora(Number(x))} formatter={(v) => [`${n(v as number, 2)} ${unidad}`, soloNivel ? "Nivel" : "Caudal"]} contentStyle={tooltipEstilo} />
              {umbrales.map((u, i) => (
                <ReferenceLine
                  key={u}
                  y={u}
                  stroke={["#e0b400", "#ff8c1a", "#da1616"][i]}
                  strokeDasharray="5 4"
                  label={{ value: NOMBRES_AVISO[i], fontSize: 11, position: "insideTopLeft" }}
                />
              ))}
              <Line dataKey="caudal" name="Caudal" stroke="var(--c-lluvia)" dot={false} strokeWidth={2.2} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          {a.lluvia && (
            <div className="lluvia-rio">
              <small className="suave">
                Lluvia diaria en {a.lluvia.nombre}
                {a.lluvia.km > 0 && ` (a ${a.lluvia.km} km)`}
                {!hayLluvia && ": no ha llovido en este periodo"}
              </small>
              {hayLluvia && (
                <ResponsiveContainer width="100%" height={80}>
                  <ComposedChart data={lluvia} margin={MARGEN}>
                    {eje}
                    <YAxis width={44} tick={{ className: "eje" }} stroke="var(--borde)" allowDecimals={false} tickCount={2} unit=" mm" />
                    <Tooltip labelFormatter={(x) => diaHora(Number(x)).split(",")[0]} formatter={(v) => [`${n(v as number, 1)} mm`, "Lluvia"]} contentStyle={tooltipEstilo} />
                    <Bar dataKey="lluvia" fill="var(--c-intensidad)" barSize={horas > 24 * 10 ? 6 : 18} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </>
      )}
      <p className="suave pequeno nota-rio">
        Aforo {a.codigo ?? ""} de la confederación hidrográfica{a.confederacion ? ` del ${a.confederacion}` : ""}, publicado por el{" "}
        <a href="https://observatorioagua.miteco.es/hidrologia/" target="_blank" rel="noreferrer">
          Observatorio del Agua (MITECO)
        </a>{" "}
        con unos 40–60 minutos de retraso. Datos en tiempo real, provisionales y sin validar.{a.umbrales.length > 0 && " Umbrales de aviso de la confederación."}
      </p>
    </section>
  );
}
