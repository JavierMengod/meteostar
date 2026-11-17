import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leafletGlobal";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import SinPrefijo from "./SinPrefijo";
import { n } from "../formato";

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
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const icono = (p: PuntoMapa) =>
  L.divIcon({
    className: `marcador ${p.oficial ? "oficial" : ""}`,
    html: `<a href="${escapar(p.href)}"${p.href.startsWith("http") ? ' target="_blank" rel="noreferrer"' : ""}><span class="marcador-temp"${p.color ? ` style="background:${escapar(p.color)}"` : ""}>${p.etiqueta ? escapar(p.etiqueta) : p.valor === null ? "—" : `${n(p.valor)}°`}</span><span class="marcador-nombre">${escapar(p.nombre)}</span><i></i></a>`,
    iconSize: [0, 0],
  });

/** Puntos agrupados: los cercanos se juntan en un círculo con el número de puntos hasta acercarse. */
function Agrupados({ puntos }: { puntos: PuntoMapa[] }) {
  const mapa = useMap();
  useEffect(() => {
    const grupo = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: (c) =>
        L.divIcon({ className: "grupo-mapa", html: `<span>${c.getChildCount()}</span>`, iconSize: [34, 34] }),
    });
    for (const p of puntos) grupo.addLayer(L.marker([p.lat, p.lon], { icon: icono(p) }));
    mapa.addLayer(grupo);
    return () => {
      mapa.removeLayer(grupo);
    };
  }, [mapa, puntos]);
  return null;
}

export default function Mapa({
  puntos,
  alto = 380,
  margen = 0.25,
  agrupar = false,
}: {
  puntos: PuntoMapa[];
  alto?: number;
  /** Margen alrededor de los puntos (fracción) */
  margen?: number;
  /** Juntar los puntos cercanos (para mapas con muchos puntos) */
  agrupar?: boolean;
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
        {agrupar ? <Agrupados puntos={puntos} /> : puntos.map((p) => <Marker key={p.href} position={[p.lat, p.lon]} icon={icono(p)} />)}
        <SinPrefijo />
      </MapContainer>
    </div>
  );
}
