// Caudal medido del Turia en Teruel (y del Alfambra), del Observatorio del Agua del MITECO.
import { useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { comparaNormal, diaHidrologico } from "../../shared/hidrologia";
import type { Aforo, RespuestaAforos, ResumenAforo } from "../../shared/tipos";
import { usePeticion } from "../datos";
import { diaHora, hace, hora, n } from "../formato";

const PERIODOS: [number, string][] = [
  [48, "48 h"],
  [24 * 7, "7 días"],
  [24 * 30, "30 días"],
];

const NOMBRES_AVISO = ["Aviso amarillo", "Aviso naranja", "Aviso rojo"];

/** Situación del caudal respecto a los umbrales oficiales de la confederación. */
export function situacion(
  caudal: number | null,
  umbrales: number[],
): { texto: string; clase: string; siguiente: string | null } {
  if (caudal === null)
    return { texto: "Sin dato de caudal", clase: "estable", siguiente: null };
  let nivel = -1;
  umbrales.forEach((u, i) => {
    if (caudal >= u) nivel = i;
  });
  const siguiente =
    umbrales[nivel + 1] !== undefined
      ? `${NOMBRES_AVISO[nivel + 1] ?? "Aviso"} a partir de ${n(umbrales[nivel + 1], 0)} m³/s`
      : null;
  if (nivel < 0)
    return {
      texto: umbrales.length ? "Normal, sin aviso" : "Sin umbrales de aviso",
      clase: "estable",
      siguiente,
    };
  return {
    texto: NOMBRES_AVISO[nivel] ?? "Aviso",
    clase: ["aviso-1", "aviso-2", "aviso-3"][nivel] ?? "aviso-3",
    siguiente,
  };
}

function Tendencia({ v }: { v: number | null }) {
  if (v === null) return null;
  const clase = v > 0.05 ? "sube" : v < -0.05 ? "baja" : "estable";
  const texto =
    clase === "estable" ? "Estable" : clase === "sube" ? "Subiendo" : "Bajando";
  return (
    <span className={`variacion ${clase}`}>
      {clase === "sube" ? "▲" : clase === "baja" ? "▼" : "●"} {texto}{" "}
      {clase !== "estable" &&
        `(${v > 0 ? "+" : "−"}${n(Math.abs(v), 2)} m³/s en 3 h)`}
    </span>
  );
}

function Grafica({
  principal,
  afluente,
  horas,
}: {
  principal: Aforo;
  afluente?: Aforo;
  horas: number;
}) {
  const desde = Date.now() / 1000 - horas * 3600;
  const porT = new Map<
    number,
    { t: number; caudal?: number | null; afluente?: number | null }
  >();
  for (const [t, c] of principal.serie)
    if (t >= desde && c !== null) porT.set(t, { t, caudal: c });
  if (afluente)
    for (const [t, c] of afluente.serie)
      if (t >= desde && c !== null)
        porT.set(t, { ...(porT.get(t) ?? { t }), afluente: c });
  const datos = [...porT.values()].sort((a, b) => a.t - b.t);
  if (datos.length < 2)
    return (
      <p className="vacio">
        Aún no hay lecturas suficientes para este periodo.
      </p>
    );
  const maximo = Math.max(...datos.map((d) => d.caudal ?? 0));
  // Los umbrales solo se dibujan si el río se acerca a ellos; si no, aplastarían la gráfica
  const umbrales = principal.umbrales.filter((u) => u <= maximo * 1.6);
  // Para varios días, una marca por día a medianoche (evita días repetidos en el eje)
  const ticks: number[] = [];
  if (horas > 48) {
    const d = new Date(datos[0].t * 1000);
    d.setHours(24, 0, 0, 0);
    const paso = horas > 24 * 10 ? 5 : 1;
    for (let t = d.getTime() / 1000; t <= datos.at(-1)!.t; t += 86400 * paso)
      ticks.push(t);
  }
  // Si aún no hay histórico para todo el periodo, se avisa (el histórico se va guardando cada 10 minutos)
  const corto = datos[0].t > desde + 12 * 3600;
  return (
    <>
      {corto && (
        <p className="suave pequeno aviso-corto">
          Por ahora hay lecturas desde el {diaHora(datos[0].t).split(",")[0]}:
          Meteostar las va guardando y el histórico se completará solo.
        </p>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart
          data={datos}
          margin={{ top: 4, right: 4, bottom: 0, left: -6 }}
        >
          <CartesianGrid stroke="var(--rejilla)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={ticks.length ? ticks : undefined}
            tickFormatter={(t: number) =>
              horas > 48 ? diaHora(t).split(",")[0] : hora(t)
            }
            minTickGap={40}
            tick={{ className: "eje" }}
            stroke="var(--borde)"
          />
          <YAxis
            width={44}
            tick={{ className: "eje" }}
            stroke="var(--borde)"
            domain={[0, "auto"]}
          />
          <Tooltip
            labelFormatter={(t) => diaHora(Number(t))}
            formatter={(v, nombre) => [`${n(v as number, 2)} m³/s`, nombre]}
            contentStyle={{
              background: "var(--superficie)",
              border: "1px solid var(--borde)",
              borderRadius: 10,
              fontSize: 13,
            }}
          />
          <Legend
            verticalAlign="top"
            align="left"
            height={26}
            iconType="plainline"
            wrapperStyle={{ fontSize: 12 }}
          />
          {umbrales.map((u, i) => (
            <ReferenceLine
              key={u}
              y={u}
              stroke={["#e0b400", "#ff8c1a", "#da1616"][i]}
              strokeDasharray="5 4"
              label={{
                value: NOMBRES_AVISO[i],
                fontSize: 11,
                position: "insideTopLeft",
              }}
            />
          ))}
          {afluente && (
            <Line
              dataKey="afluente"
              name={`${afluente.rio} (afluente)`}
              stroke="var(--texto-suave)"
              strokeDasharray="4 3"
              dot={false}
              strokeWidth={1.4}
              isAnimationActive={false}
              connectNulls
            />
          )}
          <Line
            dataKey="caudal"
            name={`${principal.nombre}`}
            stroke="var(--c-lluvia)"
            dot={false}
            strokeWidth={2.2}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

export default function Aforos() {
  const { datos, error } = usePeticion<RespuestaAforos>(
    "/api/aforos",
    5 * 60_000,
  );
  const [horas, setHoras] = useState(24 * 7);
  const { datos: resumen } = usePeticion<ResumenAforo>("/api/aforos/turia-teruel/historico", 6 * 3600_000);
  if (!datos)
    return error ? (
      <p className="vacio">El caudal medido no está disponible ahora mismo.</p>
    ) : (
      <div className="tarjeta rio" style={{ minHeight: 360 }} />
    );
  const turia = datos.aforos.find((a) => a.id === "turia-teruel");
  const alfambra = datos.aforos.find((a) => a.id === "alfambra-teruel");
  if (!turia) return null;
  const u = turia.ultimo;
  const sit = situacion(u?.caudal ?? null, turia.umbrales);
  // Frente a lo habitual para la fecha (percentiles del Anuario de Aforos)
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const normalHoy = resumen?.normal[diaHidrologico(hoy)] ?? null;
  const frente = u?.caudal != null && normalHoy ? comparaNormal(u.caudal, normalHoy) : null;
  return (
    <section className="tarjeta rio">
      <div className="rio-resumen">
        <div>
          <small className="mono">CAUDAL MEDIDO · TURIA EN TERUEL</small>
          <p className="numero-grande">
            {n(u?.caudal ?? null, 2)}
            <sup>m³/s</sup>
          </p>
          <Tendencia v={turia.tendencia} />
          {frente && normalHoy && (
            <p className="frente-normal">
              <span className={`variacion ${frente.clase}`}>{frente.texto}</span>{" "}
              <span className="suave pequeno">(lo habitual estos días: {n(normalHoy[2], 2)} m³/s)</span>
            </p>
          )}
          <p className="suave pequeno">
            {u?.nivel !== null &&
              u?.nivel !== undefined &&
              `Nivel ${n(u.nivel, 2)} m · `}
            {u
              ? `lectura de las ${hora(u.t)} (${hace(Math.floor(Date.now() / 1000) - u.t)})`
              : "sin lecturas"}
          </p>
        </div>
        <div className="rio-situacion">
          <span className={`insignia-aviso ${sit.clase}`}>{sit.texto}</span>
          {sit.siguiente && <small className="suave">{sit.siguiente}</small>}
          {alfambra?.ultimo?.caudal != null && (
            <small className="suave">
              De ello, el Alfambra aporta {n(alfambra.ultimo.caudal, 2)} m³/s
            </small>
          )}
        </div>
      </div>
      <div className="periodos" role="tablist">
        {PERIODOS.map(([h, t]) => (
          <button
            key={h}
            role="tab"
            aria-selected={horas === h}
            className={horas === h ? "activo" : ""}
            onClick={() => setHoras(h)}
          >
            {t}
          </button>
        ))}
      </div>
      <Grafica principal={turia} afluente={alfambra} horas={horas} />
      <p className="suave pequeno nota-rio">
        Aforo 08015 de la Confederación Hidrográfica del Júcar, el más cercano a
        Villastar (aguas arriba, ya con el Alfambra). Datos en tiempo real,
        provisionales y sin validar, del{" "}
        <a
          href="https://observatorioagua.miteco.es/hidrologia/"
          target="_blank"
          rel="noreferrer"
        >
          Observatorio del Agua (MITECO)
        </a>
        . Umbrales de aviso de la confederación.
      </p>
    </section>
  );
}
