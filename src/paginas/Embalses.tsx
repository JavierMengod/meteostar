// Embalses: el primero de la lista (el «de casa») destacado arriba y el resto agrupados por cuenca.
// Datos del boletín semanal del MITECO y, si lo hay, el dato reciente del SAIH.
import { lazy, Suspense } from "react";
import type { Embalse, RespuestaEmbalses } from "../../shared/tipos";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import { usePeticion } from "../datos";
import { colorEmbalse } from "../embalses";
import { conSigno, fechaCompleta, hora, n, nombreMes } from "../formato";

const Mapa = lazy(() => import("../componentes/Mapa"));
const Rio = lazy(() => import("../componentes/Rio"));

/** Diferencia en puntos de porcentaje respecto a otra referencia. */
function Puntos({ actual, referencia, texto }: { actual: number | null; referencia: number | null; texto: string }) {
  if (actual == null || referencia == null) return null;
  const d = Math.round(actual - referencia);
  const clase = d > 0 ? "sube" : d < 0 ? "baja" : "estable";
  return (
    <li>
      <span className="suave">{texto}</span> <b>{n(referencia, 0)} %</b>{" "}
      <span className={`variacion ${clase}`}>{d === 0 ? "igual" : `${d > 0 ? "+" : "−"}${Math.abs(d)} puntos ahora`}</span>
    </li>
  );
}

function Comparativa({ e }: { e: Embalse }) {
  if (e.anioPasado == null && !e.media) return null;
  return (
    <ul className="comparativa-embalse">
      <Puntos actual={e.porcentaje} referencia={e.anioPasado} texto="Hace un año" />
      {e.media && <Puntos actual={e.porcentaje} referencia={e.media.porcentaje} texto={`Media de ${e.media.anios} años`} />}
    </ul>
  );
}

function Variacion({ v }: { v: number | null }) {
  if (v === null) return null;
  const clase = v > 0 ? "sube" : v < 0 ? "baja" : "estable";
  return (
    <span className={`variacion ${clase}`}>
      {v > 0 ? "▲" : v < 0 ? "▼" : "●"} {conSigno(v)} hm³ en 7 días
    </span>
  );
}

/** Minigráfica del último año (porcentaje semanal). */
function Serie({ serie, color }: { serie: Embalse["serie"]; color: string }) {
  const puntos = serie.filter((s): s is [string, number] => s[1] !== null);
  if (puntos.length < 2) return null;
  const ancho = 300;
  const alto = 44;
  const x = (i: number) => (i / (puntos.length - 1)) * ancho;
  const y = (p: number) => alto - 2 - (Math.min(100, Math.max(0, p)) / 100) * (alto - 4);
  const linea = puntos.map(([, p], i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  return (
    <svg className="serie-embalse" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" role="img" aria-label="Evolución del último año">
      <path d={`${linea} L${ancho} ${alto} L0 ${alto} Z`} fill={color} opacity="0.12" />
      <path d={linea} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const mesAnio = (fecha: string) => nombreMes(fecha.slice(0, 7)).replace(" de ", " ");

function TarjetaEmbalse({ e }: { e: Embalse }) {
  const color = colorEmbalse(e.porcentaje);
  return (
    <a href={`/embalses/${e.slug}`} className="tarjeta tarjeta-embalse enlace">
      <h3>{e.nombre}</h3>
      <p className="suave pequeno">
        {e.rio ? `Río ${e.rio} · ` : ""}
        {e.provincia}
      </p>
      <p className="numero-medio" style={{ color }}>
        {n(e.porcentaje, 0)}
        <sup>%</sup>
      </p>
      <div className="barra-embalse">
        <i style={{ width: `${Math.min(100, e.porcentaje ?? 0)}%`, background: color }} />
      </div>
      <p>
        <b>{n(e.volumen, 0)} hm³</b> <span className="suave">de {n(e.capacidad, 0)} hm³</span>
      </p>
      <Variacion v={e.variacion} />
      <Comparativa e={e} />
      <Serie serie={e.serie} color={color} />
      {e.maximo && e.minimo && (
        <p className="suave pequeno">
          Máx. <b>{n(e.maximo.volumen, 0)} hm³</b> ({mesAnio(e.maximo.fecha)}) · Mín. <b>{n(e.minimo.volumen, 0)} hm³</b> (
          {mesAnio(e.minimo.fecha)}){e.desde && ` · desde ${e.desde.slice(0, 4)}`}
        </p>
      )}
      <Reciente e={e} />
      <span className="ver-grafica">Ver gráfica y datos ›</span>
    </a>
  );
}

function Reciente({ e }: { e: Embalse }) {
  if (!e.reciente) return null;
  return (
    <p className="reciente-embalse">
      <span className="mono">{e.reciente.fuente}</span> · {hora(e.reciente.ts)}: <b>{n(e.reciente.volumen)} hm³</b>
      {e.reciente.porcentaje !== null && ` (${n(e.reciente.porcentaje)} %)`}
      {e.reciente.nivel !== null && ` · cota ${n(e.reciente.nivel, 2)} m`}
    </p>
  );
}

/** El embalse de casa, grande y arriba. */
function Destacado({ e }: { e: Embalse }) {
  const color = colorEmbalse(e.porcentaje);
  return (
    <a href={`/embalses/${e.slug}`} className="tarjeta embalse-destacado enlace">
      <div className="destacado-estado">
        <small className="mono">EL EMBALSE DE CASA</small>
        <h2>{e.nombre}</h2>
        <p className="suave pequeno">
          {e.rio ? `Río ${e.rio} · ` : ""}
          {e.provincia}
        </p>
        <p className="numero-enorme" style={{ color }}>
          {n(e.porcentaje, 0)}
          <sup>%</sup>
        </p>
        <div className="barra-embalse grande">
          <i style={{ width: `${Math.min(100, e.porcentaje ?? 0)}%`, background: color }} />
        </div>
        <p>
          <b>{n(e.volumen, 0)} hm³</b> <span className="suave">de {n(e.capacidad, 0)} hm³</span>
        </p>
        <Variacion v={e.variacion} />
      </div>
      <div className="destacado-detalle">
        <Comparativa e={e} />
        <Serie serie={e.serie} color={color} />
        <p className="suave pequeno">Último año, porcentaje semanal</p>
        <Reciente e={e} />
        <span className="ver-grafica">Ver gráfica y datos ›</span>
      </div>
    </a>
  );
}

/** Aforos de río por cuenca. Sus datos en tiempo real solo se publican en la web del SAIH, así que se enlazan. */
const AFOROS: Record<string, { nombre: string; detalle: string; url: string; fuente: string }[]> = {
  Júcar: [
    {
      nombre: "Caudal medido en Teruel",
      detalle: "El dato real, cada pocos minutos: aforo del Turia en Teruel (08015), el más cercano a Villastar aguas arriba, y del Alfambra en Teruel (08027).",
      url: "https://saih.chj.es/",
      fuente: "SAIH Júcar",
    },
  ],
};

function Aforo({ a }: { a: (typeof AFOROS)[string][number] }) {
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="tarjeta tarjeta-aforo enlace">
      <small className="mono">{a.fuente.toUpperCase()} · EN TIEMPO REAL</small>
      <h3>{a.nombre}</h3>
      <p className="suave pequeno">{a.detalle}</p>
      <span className="ver-grafica">Consultar en la web del {a.fuente} ↗</span>
    </a>
  );
}

export default function Embalses() {
  const { datos, error } = usePeticion<RespuestaEmbalses>("/api/embalses", 30 * 60_000);
  if (!datos) return <Cargando error={error} />;
  const [casa, ...resto] = datos.embalses;
  const cuencas = [...new Set(resto.map((e) => e.cuenca))];
  const rios = (c: string) => [...new Set(datos.embalses.filter((e) => e.cuenca === c && e.rio).map((e) => e.rio!))];

  return (
    <>
      <section className="cabecera-embalses">
        <h1>Hidrología</h1>
        <p className="suave">
          El río Turia en Villastar y los embalses de la zona. Embalses: boletín semanal del MITECO
          {datos.fecha && ` del ${fechaCompleta(datos.fecha)}`}.
        </p>
      </section>

      {casa && <Destacado e={casa} />}

      <CabeceraSeccion titulo="Río Turia en Villastar" nota="Caudal estimado y previsión a 15 días" />
      <div className="rejilla-rio">
        <Suspense fallback={<div className="tarjeta rio" style={{ minHeight: 320 }} />}>
          <Rio />
        </Suspense>
        {AFOROS.Júcar.map((a) => (
          <Aforo key={a.nombre} a={a} />
        ))}
      </div>

      {cuencas.map((c) => {
        const r = rios(c);
        return (
          <div key={c}>
            <CabeceraSeccion
              titulo={`Cuenca del ${c}`}
              nota={r.length ? `${r.length > 1 ? "Ríos" : "Río"} ${r.join(", ").replace(/, ([^,]*)$/, " y $1")}` : undefined}
            />
            <div className="rejilla-3">
              {resto
                .filter((e) => e.cuenca === c)
                .map((e) => (
                  <TarjetaEmbalse key={e.slug} e={e} />
                ))}
            </div>
          </div>
        );
      })}

      {datos.embalses.some((e) => e.lat !== null) && (
        <>
          <CabeceraSeccion titulo="Mapa de embalses" />
          <Suspense fallback={<div className="mapa" />}>
            <Mapa
              puntos={datos.embalses
                .filter((e) => e.lat !== null && e.lon !== null)
                .map((e) => ({ lat: e.lat!, lon: e.lon!, nombre: e.nombre, valor: null, etiqueta: `${n(e.porcentaje, 0)} %`, href: `/embalses/${e.slug}`, color: colorEmbalse(e.porcentaje) }))}
            />
          </Suspense>
        </>
      )}

      <p className="nota-fuente seccion">
        Datos procesados por{" "}
        <a href="https://mapasdeembalses.es/" target="_blank" rel="noreferrer">
          MapasDeEmbalses.es
        </a>{" "}
        · Fuente original:{" "}
        <a href="https://www.miteco.gob.es/es/agua/temas/evaluacion-de-los-recursos-hidricos/boletin-hidrologico.html" target="_blank" rel="noreferrer">
          MITECO (boletín hidrológico semanal)
        </a>{" "}
        y, en el dato reciente, el SAIH de cada confederación (datos provisionales, no contrastados).
        {datos.errores.length > 0 && ` No se han podido leer: ${datos.errores.join(", ")}.`}
      </p>
    </>
  );
}
