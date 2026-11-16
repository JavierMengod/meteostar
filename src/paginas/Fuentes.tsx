// Fuentes de datos y créditos: lo que piden las licencias de cada servicio, reunido en un sitio.
import type { ReactNode } from "react";

function Fuente({ titulo, children, enlaces }: { titulo: string; children: ReactNode; enlaces: [string, string][] }) {
  return (
    <section className="tarjeta fuente">
      <h3>{titulo}</h3>
      <p>{children}</p>
      <p className="fuente-enlaces">
        {enlaces.map(([texto, url]) => (
          <a key={url} href={url} target="_blank" rel="noreferrer">
            {texto} ↗
          </a>
        ))}
      </p>
    </section>
  );
}

export default function Fuentes() {
  return (
    <>
      <div className="titulo-pagina">
        <h1>Fuentes de datos</h1>
        <p className="suave">De dónde sale cada dato de Meteostar y con qué licencia se usa.</p>
      </div>

      <div className="rejilla-2">
        <Fuente titulo="Estaciones de la red" enlaces={[]}>
          Estaciones meteorológicas particulares que envían sus datos a Meteostar o se leen de ecowitt.net y Weather Underground. Son datos de
          aficionados, sin validar oficialmente.
        </Fuente>
        <Fuente titulo="Meteoclimatic" enlaces={[["meteoclimatic.net", "https://www.meteoclimatic.net/"]]}>
          Algunas estaciones se leen de la red Meteoclimatic, con licencia Creative Commons BY-NC-ND 3.0: se citan y no se usan con fines
          comerciales.
        </Fuente>
        <Fuente titulo="Estaciones oficiales" enlaces={[["AEMET OpenData", "https://opendata.aemet.es/"]]}>
          Observaciones horarias de la Agencia Estatal de Meteorología. © AEMET. Información elaborada utilizando, entre otras, la obtenida de
          la Agencia Estatal de Meteorología.
        </Fuente>
        <Fuente titulo="Previsión" enlaces={[["open-meteo.com", "https://open-meteo.com/"]]}>
          Previsión por horas y a 14 días de Open-Meteo, a partir de los modelos de los servicios meteorológicos europeos. Licencia CC BY 4.0.
        </Fuente>
        <Fuente titulo="Radar" enlaces={[["rainviewer.com", "https://www.rainviewer.com/"]]}>
          Imágenes de radar de precipitación de RainViewer, de las últimas dos horas.
        </Fuente>
        <Fuente titulo="Satélite" enlaces={[["EUMETSAT", "https://view.eumetsat.int/"], ["Natural Earth", "https://www.naturalearthdata.com/"]]}>
          Imágenes del Meteosat de tercera generación (MTG) de EUMETSAT, licencia CC BY 4.0. Costas y fronteras de Natural Earth (dominio
          público).
        </Fuente>
        <Fuente
          titulo="Embalses"
          enlaces={[
            ["MapasDeEmbalses.es", "https://mapasdeembalses.es/"],
            ["Boletín hidrológico (MITECO)", "https://www.miteco.gob.es/es/agua/temas/evaluacion-de-los-recursos-hidricos/boletin-hidrologico.html"],
          ]}
        >
          Datos procesados por MapasDeEmbalses.es. Fuente original: boletín hidrológico semanal del MITECO y, en el dato reciente, el SAIH de
          cada confederación hidrográfica (provisional, no contrastado).
        </Fuente>
        <Fuente
          titulo="Caudal del río"
          enlaces={[
            ["Open-Meteo (crecidas)", "https://open-meteo.com/en/docs/flood-api"],
            ["Copernicus GloFAS", "https://global-flood.emergency.copernicus.eu/"],
          ]}
        >
          Caudal diario estimado y previsión del modelo hidrológico GloFAS del servicio de emergencias de Copernicus, a través de Open-Meteo.
          Licencia CC BY 4.0. Es una estimación, no una medición. El caudal medido se puede consultar en la web del SAIH Júcar.
        </Fuente>
        <Fuente titulo="Mapas" enlaces={[["© OpenStreetMap", "https://www.openstreetmap.org/copyright"]]}>
          Cartografía de los colaboradores de OpenStreetMap, con licencia ODbL.
        </Fuente>
      </div>

      <section className="tarjeta aviso-fuentes">
        <h3>Aviso</h3>
        <p>
          Meteostar es una web sin ánimo de lucro. Los datos se muestran tal como llegan de cada fuente y pueden contener errores o retrasos:
          son orientativos y no tienen valor oficial. Para avisos y decisiones importantes, consulta siempre a AEMET y a Protección Civil.
        </p>
      </section>
    </>
  );
}
