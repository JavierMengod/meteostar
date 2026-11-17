// Página de un río (aforo): caudal medido ahora, dónde está y su embalse, previsión a 15 días e histórico.
import { lazy, Suspense } from "react";
import type { DetalleAforo, RespuestaEmbalses } from "../../shared/tipos";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import { usePeticion } from "../datos";
import { colorEmbalse } from "../embalses";
import { conSigno, n } from "../formato";
import { situacionAforo } from "../rios";

const Mapa = lazy(() => import("../componentes/Mapa"));
const AforoAhora = lazy(() => import("../componentes/AforoAhora"));
const PrevisionAforo = lazy(() => import("../componentes/PrevisionAforo"));
const HistoricoAforo = lazy(() => import("../componentes/HistoricoAforo"));

/** Mapa del aforo con el embalse que lo regula y la estación de lluvia. */
function Situacion({ a, embalses }: { a: DetalleAforo; embalses: RespuestaEmbalses | null }) {
  const s = situacionAforo(a);
  const e = a.embalse ? embalses?.embalses.find((x) => x.slug === a.embalse) : undefined;
  const puntos = [
    {
      lat: a.lat,
      lon: a.lon,
      nombre: a.nombre,
      valor: null,
      etiqueta: s.caudal === null ? "—" : `${n(s.caudal, 2)} m³/s`,
      href: `/rios/${a.slug}`,
      color: s.color,
    },
  ];
  if (e?.lat != null && e.lon != null) {
    puntos.push({ lat: e.lat, lon: e.lon, nombre: `Embalse de ${e.nombre}`, valor: null, etiqueta: `${n(e.porcentaje, 0)} %`, href: `/embalses/${e.slug}`, color: colorEmbalse(e.porcentaje) });
  }
  return (
    <div className="rejilla-situacion">
      <Suspense fallback={<div className="mapa" style={{ height: 260 }} />}>
        <Mapa puntos={puntos} alto={260} margen={0.7} />
      </Suspense>
      <div className="situacion-datos">
        {e && (
          <a href={`/embalses/${e.slug}`} className="tarjeta enlace embalse-rio">
            <small className="mono">EMBALSE QUE LO REGULA</small>
            <h3>{e.nombre}</h3>
            <p className="numero-medio" style={{ color: colorEmbalse(e.porcentaje) }}>
              {n(e.porcentaje, 0)}
              <sup>%</sup>
            </p>
            <div className="barra-embalse">
              <i style={{ width: `${Math.min(100, e.porcentaje ?? 0)}%`, background: colorEmbalse(e.porcentaje) }} />
            </div>
            <p className="suave pequeno">
              {n(e.volumen, 0)} de {n(e.capacidad, 0)} hm³{e.variacion !== null && ` · ${conSigno(e.variacion)} hm³ en 7 días`}
            </p>
            <span className="ver-grafica">Ver el embalse ›</span>
          </a>
        )}
        <div className="tarjeta ficha-aforo">
          <small className="mono">EL AFORO</small>
          <p>
            <b>{a.nombre}</b>
            {a.codigo && <span className="suave"> · estación {a.codigo}</span>}
          </p>
          <p className="suave pequeno">
            Río {a.rio}
            {a.confederacion && ` · Confederación Hidrográfica del ${a.confederacion}`}
          </p>
          {a.lluvia && (
            <p className="suave pequeno">
              Lluvia de la estación <a href={`/estacion/${a.lluvia.slug}`}>{a.lluvia.nombre}</a>
              {a.lluvia.km > 0 && ` (a ${a.lluvia.km} km)`}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RioDetalle({ slug }: { slug: string }) {
  const { datos: a, error } = usePeticion<DetalleAforo>(`/api/aforos/${slug}`, 5 * 60_000);
  const { datos: embalses } = usePeticion<RespuestaEmbalses>("/api/embalses", 30 * 60_000);
  if (!a) return <Cargando error={error} />;
  const nombreEmbalse = a.embalse ? (embalses?.embalses.find((x) => x.slug === a.embalse)?.nombre ?? null) : null;

  return (
    <>
      <div className="titulo-pagina">
        <a href="/rios" className="pequeno">
          ‹ Ríos
        </a>
        <h1>{a.nombre}</h1>
        <p className="suave">
          Río {a.rio}
          {a.confederacion && ` · cuenca del ${a.confederacion}`}
          {a.codigo && ` · aforo ${a.codigo}`}
        </p>
      </div>

      <CabeceraSeccion titulo="Ahora" nota="Caudal medido cada 10 minutos" />
      <Suspense fallback={<div className="tarjeta rio" style={{ minHeight: 360 }} />}>
        <AforoAhora a={a} />
      </Suspense>

      <CabeceraSeccion titulo="Previsión" nota="Los próximos 15 días" />
      <Suspense fallback={<div className="tarjeta rio" style={{ minHeight: 320 }} />}>
        <PrevisionAforo slug={a.slug} />
      </Suspense>

      {a.tieneHistorico && (
        <>
          <CabeceraSeccion titulo="Histórico" nota="Cada año comparado con lo normal y con otros años" />
          <Suspense fallback={<div className="tarjeta" style={{ minHeight: 400 }} />}>
            <HistoricoAforo estacion={a.slug} embalse={nombreEmbalse} />
          </Suspense>
        </>
      )}

      <CabeceraSeccion titulo="Dónde está" />
      <Situacion a={a} embalses={embalses ?? null} />

      <p className="nota-fuente seccion">
        Más datos de este aforo en el{" "}
        <a href="https://observatorioagua.miteco.es/hidrologia/" target="_blank" rel="noreferrer">
          Observatorio del Agua (MITECO)
        </a>
        {a.confederacion === "Júcar" && (
          <>
            {" "}
            y en el{" "}
            <a href="https://saih.chj.es/" target="_blank" rel="noreferrer">
              SAIH Júcar
            </a>
          </>
        )}
        .
      </p>
    </>
  );
}
