// Ríos: caudal medido del Turia en Teruel (Observatorio del Agua, MITECO), su histórico (Anuario de Aforos)
// y la previsión del modelo GloFAS de Copernicus.
import { lazy, Suspense } from "react";
import { CabeceraSeccion } from "../componentes/Piezas";

const Rio = lazy(() => import("../componentes/Rio"));
const Aforos = lazy(() => import("../componentes/Aforos"));
const HistoricoAforo = lazy(() => import("../componentes/HistoricoAforo"));

/** Otras webs donde consultar el aforo, al pie de la página. */
const ENLACES_AFORO: [string, string][] = [
  ["Observatorio del Agua (MITECO)", "https://observatorioagua.miteco.es/hidrologia/"],
  ["SAIH Júcar", "https://saih.chj.es/"],
  ["lluviasypantanos.es", "https://lluviasypantanos.es/rio/turia-teruel"],
];

export default function Rios() {
  return (
    <>
      <section className="cabecera-embalses">
        <h1>Ríos</h1>
        <p className="suave">El caudal medido del Turia junto a Villastar y lo que se espera en los próximos 15 días.</p>
      </section>

      <CabeceraSeccion titulo="Río Turia" nota="Caudal medido cada 10 minutos" />
      <Suspense fallback={<div className="tarjeta rio" style={{ minHeight: 360 }} />}>
        <Aforos />
      </Suspense>

      <CabeceraSeccion titulo="Histórico del Turia en Teruel" nota="Cada año comparado con lo normal y con otros años" />
      <Suspense fallback={<div className="tarjeta" style={{ minHeight: 400 }} />}>
        <HistoricoAforo estacion="turia-teruel" />
      </Suspense>

      <CabeceraSeccion titulo="Previsión" nota="Tendencia a 15 días según el modelo de Copernicus" />
      <Suspense fallback={<div className="tarjeta rio" style={{ minHeight: 320 }} />}>
        <Rio />
      </Suspense>

      <p className="nota-fuente seccion">
        El aforo 08015 (Turia en Teruel) también se puede consultar en{" "}
        {ENLACES_AFORO.map(([texto, url], i) => (
          <span key={url}>
            {i > 0 && (i === ENLACES_AFORO.length - 1 ? " y " : ", ")}
            <a href={url} target="_blank" rel="noreferrer">
              {texto}
            </a>
          </span>
        ))}
        .
      </p>
    </>
  );
}
