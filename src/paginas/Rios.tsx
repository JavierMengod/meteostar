// Ríos: caudal estimado del Turia en Villastar (Copernicus GloFAS) y enlace al caudal medido en el SAIH.
import { lazy, Suspense } from "react";
import { CabeceraSeccion } from "../componentes/Piezas";

const Rio = lazy(() => import("../componentes/Rio"));

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
        {AFOROS.Júcar.map((a) => (
          <Aforo key={a.nombre} a={a} />
        ))}
      </div>
    </>
  );
}
