// Ríos: caudal medido del Turia en Teruel (Observatorio del Agua, MITECO) y previsión del modelo GloFAS de Copernicus.
import { lazy, Suspense } from "react";
import { CabeceraSeccion } from "../componentes/Piezas";

const Rio = lazy(() => import("../componentes/Rio"));
const Aforos = lazy(() => import("../componentes/Aforos"));
const HistoricoAforo = lazy(() => import("../componentes/HistoricoAforo"));

/** Aforos de río por cuenca. Sus datos en tiempo real solo se publican en la web del SAIH, así que se enlazan. */
/** Otras webs donde consultar el aforo. */
const ENLACES_AFORO: [string, string, string][] = [
  ["Turia en Teruel, nivel y caudal", "lluviasypantanos.es", "https://lluviasypantanos.es/rio/turia-teruel"],
  ["Mapa oficial de aforos en directo", "Observatorio del Agua (MITECO)", "https://observatorioagua.miteco.es/hidrologia/"],
  ["Web de la confederación", "SAIH Júcar", "https://saih.chj.es/"],
];

function Aforo() {
  return (
    <section className="tarjeta tarjeta-aforo">
      <small className="mono">MÁS DATOS</small>
      <h3>Turia en Teruel</h3>
      <p className="suave pequeno">
        Fichas completas del aforo 08015, con nivel, caudal y lluvia:
      </p>
      <ul className="enlaces-aforo">
        {ENLACES_AFORO.map(([texto, sitio, url]) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer">
              {texto} ↗
            </a>
            <small className="suave">{sitio}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Rios() {
  return (
    <>
      <section className="cabecera-embalses">
        <h1>Ríos</h1>
        <p className="suave">El caudal medido del Turia junto a Villastar y lo que se espera en los próximos 15 días.</p>
      </section>

      <CabeceraSeccion titulo="Río Turia" nota="Caudal medido cada 10 minutos" />
      <div className="rejilla-rio">
        <Suspense fallback={<div className="tarjeta rio" style={{ minHeight: 360 }} />}>
          <Aforos />
        </Suspense>
        <Aforo />
      </div>

      <CabeceraSeccion titulo="Histórico del Turia en Teruel" nota="Cada año comparado con lo normal y con otros años" />
      <Suspense fallback={<div className="tarjeta" style={{ minHeight: 400 }} />}>
        <HistoricoAforo estacion="turia-teruel" />
      </Suspense>

      <CabeceraSeccion titulo="Previsión" nota="Tendencia a 15 días según el modelo de Copernicus" />
      <Suspense fallback={<div className="tarjeta rio" style={{ minHeight: 320 }} />}>
        <Rio />
      </Suspense>
    </>
  );
}
