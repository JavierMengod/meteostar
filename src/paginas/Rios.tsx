// Ríos: caudal estimado del Turia en Villastar (Copernicus GloFAS) y enlace al caudal medido en el SAIH.
import { lazy, Suspense } from "react";
import { CabeceraSeccion } from "../componentes/Piezas";

const Rio = lazy(() => import("../componentes/Rio"));

/** Aforos de río por cuenca. Sus datos en tiempo real solo se publican en la web del SAIH, así que se enlazan. */
/** Páginas donde se ve el caudal medido del Turia en Teruel (no hay acceso abierto para mostrarlo aquí). */
const ENLACES_AFORO: [string, string, string][] = [
  ["Turia en Teruel, nivel y caudal", "lluviasypantanos.es", "https://lluviasypantanos.es/rio/turia-teruel"],
  ["Mapa oficial de aforos en directo", "Observatorio del Agua (MITECO)", "https://observatorioagua.miteco.es/hidrologia/"],
  ["Web de la confederación", "SAIH Júcar", "https://saih.chj.es/"],
];

function Aforo() {
  return (
    <section className="tarjeta tarjeta-aforo">
      <small className="mono">CAUDAL MEDIDO · EN TIEMPO REAL</small>
      <h3>Turia en Teruel</h3>
      <p className="suave pequeno">
        El dato real del aforo de la confederación (08015), el más cercano a Villastar aguas arriba. Se puede consultar en:
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
        <p className="suave">Cómo va el Turia en Villastar comparado con lo normal y qué se espera en los próximos 15 días.</p>
      </section>

      <CabeceraSeccion titulo="Río Turia en Villastar" nota="Caudal estimado y previsión a 15 días" />
      <div className="rejilla-rio">
        <Suspense fallback={<div className="tarjeta rio" style={{ minHeight: 320 }} />}>
          <Rio />
        </Suspense>
        <Aforo />
      </div>
    </>
  );
}
