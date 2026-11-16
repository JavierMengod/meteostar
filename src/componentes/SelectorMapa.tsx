// Mapa para situar con precisión una estación o un lugar: clic o arrastrar el marcador.
// La altitud se calcula sola (modelo de terreno de Open-Meteo) y se puede corregir.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import SinPrefijo from "./SinPrefijo";

export interface Punto {
  lat: number;
  lon: number;
  altitud: number;
}

const icono = L.divIcon({ className: "marcador-punto", html: "<i></i>", iconSize: [0, 0] });

function AlPulsar({ cambiar }: { cambiar: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => cambiar(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Recentra el mapa cuando el punto cambia desde fuera (inputs, "mi ubicación"). */
function Seguir({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().pad(-0.2).contains([lat, lon])) map.setView([lat, lon], Math.max(map.getZoom(), 13));
  }, [lat, lon, map]);
  return null;
}

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

export default function SelectorMapa({ punto, cambiar }: { punto: Punto; cambiar: (p: Punto) => void }) {
  const [calculando, setCalculando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const ultimo = useRef("");

  /** Mueve el punto y pide su altitud. */
  const mover = async (lat: number, lon: number) => {
    const p = { lat: r5(lat), lon: r5(lon), altitud: punto.altitud };
    cambiar(p);
    const clave = `${p.lat},${p.lon}`;
    ultimo.current = clave;
    setCalculando(true);
    try {
      const r = await fetch(`/api/elevacion?lat=${p.lat}&lon=${p.lon}`);
      const j: { altitud: number | null } = await r.json();
      if (ultimo.current === clave && j.altitud !== null) cambiar({ ...p, altitud: Math.round(j.altitud) });
    } catch {
      /* se queda la altitud anterior; el usuario la puede escribir */
    } finally {
      if (ultimo.current === clave) setCalculando(false);
    }
  };

  const miUbicacion = () => {
    setAviso(null);
    if (!navigator.geolocation) return setAviso("Tu navegador no permite obtener la ubicación.");
    navigator.geolocation.getCurrentPosition(
      (pos) => mover(pos.coords.latitude, pos.coords.longitude),
      () => setAviso("No se ha podido obtener tu ubicación."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="selector-mapa">
      <div className="mapa" style={{ height: 340 }}>
        <MapContainer center={[punto.lat, punto.lon]} zoom={13} scrollWheelZoom style={{ height: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={[punto.lat, punto.lon]}
            icon={icono}
            draggable
            eventHandlers={{ dragend: (e) => mover(e.target.getLatLng().lat, e.target.getLatLng().lng) }}
          />
          <AlPulsar cambiar={mover} />
          <Seguir lat={punto.lat} lon={punto.lon} />
          <SinPrefijo />
        </MapContainer>
      </div>
      <p className="suave pequeno">Pulsa en el mapa o arrastra el marcador hasta el sitio exacto. Acércate con la rueda del ratón.</p>
      <div className="fila-campos">
        <label className="campo">
          <span>Latitud</span>
          <input type="number" step="0.00001" value={punto.lat} onChange={(e) => mover(Number(e.target.value), punto.lon)} />
        </label>
        <label className="campo">
          <span>Longitud</span>
          <input type="number" step="0.00001" value={punto.lon} onChange={(e) => mover(punto.lat, Number(e.target.value))} />
        </label>
        <label className="campo">
          <span>Altitud (m) {calculando && <small>calculando…</small>}</span>
          <input type="number" step="1" value={punto.altitud} onChange={(e) => cambiar({ ...punto, altitud: Number(e.target.value) })} />
        </label>
        <button type="button" className="boton-secundario" onClick={miUbicacion}>
          📍 Usar mi ubicación
        </button>
      </div>
      {aviso && <p className="error-form">{aviso}</p>}
    </div>
  );
}
