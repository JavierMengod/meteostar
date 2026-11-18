// Histórico de un aforo: año hidrológico frente a lo normal y a otro año, agua de cada año, meses y récords.
// Datos del Anuario de Aforos (MITECO / CEDEX) y medias diarias de las lecturas en tiempo real.
import { useEffect, useMemo, useState } from "react";
import { Area, Bar, BarChart, Cell, ComposedChart, CartesianGrid, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MESES_HIDROLOGICOS, diaHidrologico, nombreAnioHidrologico } from "../../shared/hidrologia";
import type { DiaAforo, ResumenAforo } from "../../shared/tipos";
import { usePeticion } from "../datos";
import { fechaCorta, n } from "../formato";

const tooltipEstilo = { background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 10, fontSize: 13 };
const COLOR_A = "var(--c-lluvia)";
const COLOR_B = "var(--c-temp)";
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaLarga = (f: string) => (f.length === 7 ? `${MESES_CORTOS[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : fechaCorta(f, true));

function useAnio(estacion: string, anio: number | null) {
  const [dias, setDias] = useState<DiaAforo[] | null>(null);
  useEffect(() => {
    if (anio === null) return;
    let vivo = true;
    setDias(null);
    fetch(`/api/aforos/${estacion}/anio/${anio}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => vivo && setDias(d))
      .catch(() => vivo && setDias([]));
    return () => {
      vivo = false;
    };
  }, [estacion, anio]);
  return dias;
}

function SelectorAnio({ valor, anios, onCambio, color, etiqueta }: { valor: number; anios: number[]; onCambio: (a: number) => void; color: string; etiqueta: string }) {
  return (
    <label className="selector-anio">
      <i style={{ background: color }} aria-hidden="true" />
      <span className="suave pequeno">{etiqueta}</span>
      <select value={valor} onChange={(e) => onCambio(Number(e.target.value))}>
        {[...anios].reverse().map((a) => (
          <option key={a} value={a}>
            {nombreAnioHidrologico(a)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Año hidrológico día a día frente a lo normal y a otro año. */
function GraficaAnio({ resumen, a, b, diasA, diasB }: { resumen: ResumenAforo; a: number; b: number; diasA: DiaAforo[]; diasB: DiaAforo[] }) {
  const datos = useMemo(() => {
    const filas = resumen.normal.map((p, i) => ({
      i,
      banda: p ? [p[0], p[4]] : null,
      centro: p ? [p[1], p[3]] : null,
      mediana: p ? p[2] : null,
      a: null as number | null,
      b: null as number | null,
    }));
    for (const [f, q] of diasA) if (q !== null) filas[diaHidrologico(f)].a = q;
    for (const [f, q] of diasB) if (q !== null) filas[diaHidrologico(f)].b = q;
    return filas;
  }, [resumen, diasA, diasB]);
  const nombreA = nombreAnioHidrologico(a);
  const nombreB = nombreAnioHidrologico(b);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={datos} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="var(--rejilla)" vertical={false} />
        <XAxis
          dataKey="i"
          type="number"
          domain={[0, 365]}
          ticks={MESES_HIDROLOGICOS.map((m) => m[0])}
          tickFormatter={(i: number) => MESES_HIDROLOGICOS.find((m) => m[0] === i)?.[1] ?? ""}
          tick={{ className: "eje" }}
          stroke="var(--borde)"
        />
        <YAxis width={44} tick={{ className: "eje" }} stroke="var(--borde)" domain={[0, "auto"]} />
        <Tooltip
          labelFormatter={(i) => {
            const m = [...MESES_HIDROLOGICOS].reverse().find((x) => x[0] <= Number(i))!;
            return `${Number(i) - m[0] + 1} ${m[1]}`;
          }}
          formatter={(v, nombre) => [Array.isArray(v) ? `${n(v[0], 2)}–${n(v[1], 2)} m³/s` : `${n(v as number, 2)} m³/s`, nombre]}
          contentStyle={tooltipEstilo}
        />
        <Legend verticalAlign="top" align="left" height={26} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Area dataKey="banda" name="Habitual (8 de cada 10 años)" stroke="none" fill="var(--texto-suave)" fillOpacity={0.13} isAnimationActive={false} legendType="square" />
        <Area dataKey="centro" name="La mitad de los años" stroke="none" fill="var(--texto-suave)" fillOpacity={0.16} isAnimationActive={false} legendType="none" />
        <Line dataKey="mediana" name="Normal" stroke="var(--texto-suave)" strokeDasharray="4 4" dot={false} strokeWidth={1.3} isAnimationActive={false} />
        {b !== a && <Line dataKey="b" name={nombreB} stroke={COLOR_B} dot={false} strokeWidth={1.7} isAnimationActive={false} connectNulls={false} />}
        <Line dataKey="a" name={nombreA} stroke={COLOR_A} dot={false} strokeWidth={2.6} isAnimationActive={false} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Agua que ha pasado cada año hidrológico. */
function GraficaAnios({ resumen, a, b, onElegir }: { resumen: ResumenAforo; a: number; b: number; onElegir: (anio: number) => void }) {
  const normales = resumen.anios.filter((x) => x.anio >= 1991 && x.anio <= 2020);
  const media = normales.length ? normales.reduce((s, x) => s + x.volumen, 0) / normales.length : null;
  // Todos los años del periodo, también los que no tienen datos, para que se vean los huecos
  const porAnio = new Map(resumen.anios.map((x) => [x.anio, x]));
  const primero = resumen.anios[0]?.anio ?? 0;
  const ultimo = Math.max(resumen.anios.at(-1)?.anio ?? 0, resumen.disponibles.at(-1) ?? 0);
  const datos = Array.from({ length: Math.max(0, ultimo - primero + 1) }, (_, i) => ({ anio: primero + i, volumen: porAnio.get(primero + i)?.volumen ?? null }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={datos} margin={{ top: 4, right: 4, bottom: 0, left: -6 }} barCategoryGap={1}>
        <CartesianGrid stroke="var(--rejilla)" vertical={false} />
        <XAxis dataKey="anio" tick={{ className: "eje" }} stroke="var(--borde)" minTickGap={24} />
        <YAxis width={44} tick={{ className: "eje" }} stroke="var(--borde)" />
        <Tooltip
          labelFormatter={(x) => `Año hidrológico ${nombreAnioHidrologico(Number(x))}`}
          formatter={(v) => [v === null || v === undefined ? "Sin datos" : `${n(v as number, decimalesHm3(v as number))} hm³`, "Agua que pasó"]}
          contentStyle={tooltipEstilo}
          cursor={{ fill: "var(--rejilla)" }}
        />
        {media !== null && <ReferenceLine y={media} stroke="var(--texto-suave)" strokeDasharray="4 4" label={{ value: `Normal ${n(media, decimalesHm3(media))} hm³`, fontSize: 11, position: "insideTopRight" }} />}
        <Bar dataKey="volumen" isAnimationActive={false} onClick={(d: any) => d?.anio && onElegir(d.anio)} style={{ cursor: "pointer" }}>
          {datos.map((x) => (
            <Cell key={x.anio} fill={x.anio === a ? COLOR_A : x.anio === b ? COLOR_B : "var(--borde)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Caudal medio de cada mes del año elegido frente a lo normal. */
/** Caudal medio de cada mes (enero = 0) con los días que haya. */
function mediasMes(dias: DiaAforo[]): Map<number, number> {
  const sumas = new Map<number, number[]>();
  for (const [f, q] of dias) {
    if (q === null) continue;
    const m = Number(f.slice(5, 7)) - 1;
    if (!sumas.has(m)) sumas.set(m, []);
    sumas.get(m)!.push(q);
  }
  return new Map([...sumas].map(([m, v]) => [m, v.reduce((s, x) => s + x, 0) / v.length]));
}

function GraficaMeses({ resumen, a, b, diasA, diasB }: { resumen: ResumenAforo; a: number; b: number; diasA: DiaAforo[]; diasB: DiaAforo[] }) {
  // Meses en orden hidrológico: octubre primero
  const orden = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8];
  const ma = mediasMes(diasA);
  const mb = mediasMes(diasB);
  const datos = orden.map((m) => ({ mes: MESES_CORTOS[m], normal: resumen.mesesNormal[m], anio: ma.get(m) ?? null, otro: mb.get(m) ?? null }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={datos} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="var(--rejilla)" vertical={false} />
        <XAxis dataKey="mes" tick={{ className: "eje" }} stroke="var(--borde)" />
        <YAxis width={44} tick={{ className: "eje" }} stroke="var(--borde)" />
        <Tooltip formatter={(v, nombre) => [v === null ? "—" : `${n(v as number, 2)} m³/s`, nombre]} contentStyle={tooltipEstilo} cursor={{ fill: "var(--rejilla)" }} />
        <Legend verticalAlign="top" align="left" height={26} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="normal" name={`Normal (${resumen.periodoNormal})`} fill="var(--borde)" isAnimationActive={false} />
        <Bar dataKey="anio" name={nombreAnioHidrologico(a)} fill={COLOR_A} isAnimationActive={false} />
        {b !== a && <Bar dataKey="otro" name={nombreAnioHidrologico(b)} fill={COLOR_B} isAnimationActive={false} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Decimales de un volumen: los ríos pequeños mueven menos de 1 hm³ al año. */
const decimalesHm3 = (v: number) => (v < 1 ? 2 : v < 10 ? 1 : 0);

function Records({ titulo, lista, nota }: { titulo: string; lista: { fecha: string; caudal: number }[]; nota: string }) {
  return (
    <div className="records-aforo">
      <h3>{titulo}</h3>
      <ol>
        {lista.map((c) => (
          <li key={c.fecha}>
            <span>{fechaLarga(c.fecha)}</span>
            <b>{n(c.caudal, c.caudal < 1 ? 2 : c.caudal < 10 ? 1 : 0)} m³/s</b>
          </li>
        ))}
      </ol>
      <p className="suave pequeno">{nota}</p>
    </div>
  );
}

export default function HistoricoAforo({ estacion, embalse }: { estacion: string; embalse: string | null }) {
  const [todo, setTodo] = useState(false);
  const { datos: resumen, error } = usePeticion<ResumenAforo>(`/api/aforos/${estacion}/historico`, 6 * 3600_000);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  // Por defecto: el año en curso frente al último año completo
  useEffect(() => {
    if (!resumen || a !== null) return;
    const actual = resumen.disponibles.at(-1) ?? null;
    setA(actual);
    // El último año completo que no sea el elegido
    setB([...resumen.anios].reverse().find((x) => x.anio !== actual)?.anio ?? null);
  }, [resumen, a]);
  const diasA = useAnio(estacion, a);
  const diasB = useAnio(estacion, b);

  if (!resumen) return error ? <p className="vacio">El histórico no está disponible ahora mismo.</p> : <div className="tarjeta" style={{ minHeight: 400 }} />;
  if (a === null || b === null) return null;
  const infoA = resumen.anios.find((x) => x.anio === a);
  const conMedidos = diasA?.some((d) => d[2] === "m");
  const regulado = !!resumen.reguladoDesde && resumen.crecidasRegulado.length > 0;

  return (
    <div className="historico-aforo">
      <section className="tarjeta">
        <div className="cabecera-historico">
          <h3 className="titulo-acento">Año hidrológico día a día</h3>
          <div className="selectores-anio">
            <SelectorAnio valor={a} anios={resumen.disponibles} onCambio={setA} color={COLOR_A} etiqueta="Año" />
            <SelectorAnio valor={b} anios={resumen.disponibles} onCambio={setB} color={COLOR_B} etiqueta="Comparar con" />
          </div>
        </div>
        {diasA && diasB ? <GraficaAnio resumen={resumen} a={a} b={b} diasA={diasA} diasB={diasB} /> : <div style={{ height: 300 }} />}
        <p className="suave pequeno">
          La franja es lo habitual para cada época del año ({resumen.periodoNormal}): 8 de cada 10 años el caudal estuvo dentro de ella.
          {infoA && ` En ${nombreAnioHidrologico(a)} pasó un caudal medio de ${n(infoA.media, 2)} m³/s, con la mayor crecida el ${fechaCorta(infoA.fechaMaximo, true)} (${n(infoA.maximo, 1)} m³/s de media ese día).`}
          {conMedidos && " Los días recientes son la media de las lecturas en tiempo real, aún sin validar."}
        </p>
      </section>

      <div className="rejilla-2">
        <section className="tarjeta">
          <h3 className="titulo-acento">Agua de cada año</h3>
          <GraficaAnios resumen={resumen} a={a} b={b} onElegir={setA} />
          <p className="suave pequeno">Hectómetros cúbicos que pasaron por el aforo en cada año hidrológico (de octubre a septiembre). Los huecos son años sin datos. Pulsa una barra para verla arriba.</p>
        </section>
        <section className="tarjeta">
          <h3 className="titulo-acento">Mes a mes</h3>
          {diasA && diasB ? <GraficaMeses resumen={resumen} a={a} b={b} diasA={diasA} diasB={diasB} /> : <div style={{ height: 220 }} />}
          <p className="suave pequeno">Caudal medio de cada mes frente a lo normal. Los meses con pocos días de datos (como el mes en curso) cuentan solo esos días.</p>
        </section>
      </div>

      <section className="tarjeta">
        <div className="cabecera-historico">
          <h3 className="titulo-acento">Récords</h3>
          {regulado && (
            <div className="periodos" role="tablist">
              <button role="tab" aria-selected={!todo} onClick={() => setTodo(false)}>
                Desde {resumen.reguladoDesde}
              </button>
              <button role="tab" aria-selected={todo} onClick={() => setTodo(true)}>
                Todo el histórico
              </button>
            </div>
          )}
        </div>
        {regulado && (
          <p className="suave pequeno">
            {todo
              ? `Incluye los años anteriores a ${resumen.reguladoDesde}, cuando el río aún no estaba regulado${embalse ? ` por el embalse de ${embalse}` : ""} y las crecidas eran mayores.`
              : `Desde que el río está regulado${embalse ? ` por el embalse de ${embalse}` : ""} (${resumen.reguladoDesde}): es lo comparable con la situación actual.`}
          </p>
        )}
        <div className="rejilla-records">
          <Records titulo="Mayores crecidas" lista={regulado && !todo ? resumen.crecidasRegulado : resumen.crecidas} nota="Caudal medio del día. Una por episodio." />
          <Records titulo="Mayores puntas" lista={regulado && !todo ? resumen.puntasRegulado : resumen.puntas} nota="Caudal instantáneo máximo registrado." />
        </div>
      </section>

      <p className="nota-fuente">
        Histórico del Anuario de Aforos: datos diarios validados desde {resumen.desde?.slice(0, 4)}, con huecos. Fuente: «©
        Ministerio para la Transición Ecológica y el Reto Demográfico». De octubre de 2022 hasta que Meteostar empezó a guardar lecturas no hay datos
        abiertos.
      </p>
    </div>
  );
}
