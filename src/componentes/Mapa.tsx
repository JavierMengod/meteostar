import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leafletGlobal";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import SinPrefijo from "./SinPrefijo";
import { n } from "../formato";

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface PuntoMapa {
  lat: number;
  lon: number;
  nombre: string;
  /** Texto de la burbuja: temperatura u otro dato */
  valor: number | null;
  href: string;
  oficial?: boolean;
  /** Texto de la burbuja si no es una temperatura (p. ej. "66 %") */
  etiqueta?: string;
  /** Color de la burbuja */
  color?: string;
  /** Siempre con etiqueta y por encima de los demás (los ríos que sigues) */
  fijo?: boolean;
  /** En vez de ir a «href», al pulsarlo se llama a esta función (p. ej. para abrir una ficha en la propia página) */
  alPulsar?: () => void;
  /** Más apagado (p. ej. estaciones que no están dadas de alta) */
  atenuado?: boolean;
}

/** Abre el marcador: un enlace, o un botón si el punto tiene «alPulsar». */
const abrir = (p: PuntoMapa, extra = "") =>
  p.alPulsar
    ? `<span class="boton-mapa" role="button" tabindex="0"${extra}>`
    : `<a href="${escapar(p.href)}"${p.href.startsWith("http") ? ' target="_blank" rel="noreferrer"' : ""}${extra}>`;
const cerrar = (p: PuntoMapa) => (p.alPulsar ? "</span>" : "</a>");

/** Texto del dato en el globo que sale al pasar el ratón. */
const textoDato = (p: PuntoMapa) => p.etiqueta ?? (p.valor === null ? "" : `${n(p.valor)} °C`);


const icono = (p: PuntoMapa, pequeno = false) =>
  L.divIcon({
    className: `marcador ${p.oficial ? "oficial" : ""} ${pequeno ? "pequeno" : ""} ${p.atenuado ? "atenuado" : ""}`,
    html: `${abrir(p)}<span class="marcador-temp"${p.color ? ` style="background:${escapar(p.color)}"` : ""}>${p.etiqueta ? escapar(p.etiqueta) : p.valor === null ? "—" : `${n(p.valor)}°`}</span><span class="marcador-nombre">${escapar(p.nombre)}</span><i></i>${cerrar(p)}`,
    iconSize: [0, 0],
  });

/** Solo un punto de color (sin etiqueta); el nombre y el dato salen al pasar el ratón o tocarlo. */
const iconoPunto = (p: PuntoMapa) =>
  L.divIcon({
    className: `punto-mapa ${p.atenuado ? "atenuado" : ""}`,
    html: `${abrir(p, ` aria-label="${escapar(p.nombre)}"`)}<span${p.color ? ` style="background:${escapar(p.color)}"` : ""}></span>${cerrar(p)}`,
    iconSize: [16, 16],
  });

/** Zoom a partir del que todos los puntos llevan su etiqueta */
const ZOOM_ETIQUETAS = 10;

/** Todos los puntos como puntos de color; con etiqueta solo los fijos, o todos al acercarse. */
function PuntosConEtiquetaFija({ puntos, pequeno }: { puntos: PuntoMapa[]; pequeno: boolean }) {
  const mapa = useMap();
  const [zoom, setZoom] = useState(() => mapa.getZoom());
  useMapEvents({ zoomend: (e) => setZoom(e.target.getZoom()) });
  const todas = zoom >= ZOOM_ETIQUETAS;
  // Los fijos, al final: se dibujan por encima
  const orden = [...puntos].sort((a, b) => Number(!!a.fijo) - Number(!!b.fijo));
  return (
    <>
      {orden.map((p) =>
        p.fijo || todas ? (
          <Marker
            key={p.href}
            position={[p.lat, p.lon]}
            icon={icono(p, pequeno)}
            zIndexOffset={p.fijo ? 1000 : p.atenuado ? -100 : 0}
            eventHandlers={p.alPulsar ? { click: p.alPulsar } : undefined}
          />
        ) : (
          <Marker
            key={p.href}
            position={[p.lat, p.lon]}
            icon={iconoPunto(p)}
            zIndexOffset={p.atenuado ? -100 : 0}
            eventHandlers={p.alPulsar ? { click: p.alPulsar } : undefined}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <b>{p.nombre}</b>
              {textoDato(p) ? ` · ${textoDato(p)}` : ""}
            </Tooltip>
          </Marker>
        ),
      )}
    </>
  );
}

/** Puntos agrupados: los cercanos se juntan en un círculo con el número de puntos hasta acercarse. */
function Agrupados({ puntos, pequeno }: { puntos: PuntoMapa[]; pequeno: boolean }) {
  const mapa = useMap();
  useEffect(() => {
    const grupo = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: (c) =>
        L.divIcon({ className: "grupo-mapa", html: `<span>${c.getChildCount()}</span>`, iconSize: [34, 34] }),
    });
    const fijos = L.layerGroup();
    for (const p of puntos) {
      if (p.fijo) fijos.addLayer(L.marker([p.lat, p.lon], { icon: icono(p, pequeno), zIndexOffset: 1000 }));
      else grupo.addLayer(L.marker([p.lat, p.lon], { icon: icono(p, pequeno) }));
    }
    mapa.addLayer(grupo);
    mapa.addLayer(fijos);
    return () => {
      mapa.removeLayer(grupo);
      mapa.removeLayer(fijos);
    };
  }, [mapa, puntos, pequeno]);
  return null;
}

export default function Mapa({
  puntos,
  alto = 380,
  margen = 0.25,
  agrupar = false,
  pequeno = false,
  soloFijos = false,
}: {
  puntos: PuntoMapa[];
  alto?: number;
  /** Margen alrededor de los puntos (fracción) */
  margen?: number;
  /** Juntar los puntos cercanos (para mapas con muchos puntos) */
  agrupar?: boolean;
  /** Etiquetas compactas (mapas con muchos puntos juntos, como el de ríos) */
  pequeno?: boolean;
  /** Etiqueta solo en los puntos fijos; los demás, un punto de color (todas al acercar el mapa) */
  soloFijos?: boolean;
}) {
  if (!puntos.length) return null;
  const limites = L.latLngBounds(puntos.map((p) => [p.lat, p.lon]));
  return (
    <div className="mapa" style={{ height: alto }}>
      <MapContainer
        {...(puntos.length > 1 ? { bounds: limites.pad(margen) } : { center: [puntos[0].lat, puntos[0].lon] as [number, number], zoom: 13 })}
        maxZoom={15}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {soloFijos ? (
          <PuntosConEtiquetaFija puntos={puntos} pequeno={pequeno} />
        ) : agrupar ? <Agrupados puntos={puntos} pequeno={pequeno} /> : puntos.map((p) => <Marker key={p.href} position={[p.lat, p.lon]} icon={icono(p, pequeno)} />)}
        <SinPrefijo />
      </MapContainer>
    </div>
  );
}
