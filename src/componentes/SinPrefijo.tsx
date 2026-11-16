import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Quita el «Leaflet» del crédito del mapa (es opcional). El crédito de los datos del mapa
 * (OpenStreetMap, RainViewer, EUMETSAT…) se mantiene: sus licencias exigen que se vea en el mapa.
 */
export default function SinPrefijo() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl?.setPrefix(false);
  }, [map]);
  return null;
}
