// Administración › Estaciones de otras redes: mapa con las estaciones de Meteoclimatic de una provincia para
// añadirlas a Meteostar o quitarlas. Las que ya están se ven marcadas.
import "leaflet/dist/leaflet.css";
import { useMemo, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { EstacionExterna, RespuestaRed } from "../../shared/tipos";
import SinPrefijo from "../componentes/SinPrefijo";
import { enviar, usePeticion } from "../datos";
import { hace, n } from "../formato";

const COLORES = {
  anadida: "#0e9f6e",
  red: "#c8901c",
  libre: "#2b82d9",
  vieja: "#9ca3af",
};

/** Distancia en km (aproximada, suficiente para ordenar). */
const distancia = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180));

function estado(e: EstacionExterna, ahora: number): keyof typeof COLORES {
  if (e.enMeteostar) return e.enMeteostar.externa ? "anadida" : "red";
  return e.t && ahora - e.t < 3 * 3600 ? "libre" : "vieja";
}

export default function GestionExternas() {
  const { datos: provincias } = usePeticion<Record<string, string>>("/api/admin/externas/provincias", 0);
  const { datos: red } = usePeticion<RespuestaRed>("/api/red");
  const [provincia, setProvincia] = useState("ESARA44");
  const { datos: lista, error, recargar } = usePeticion<EstacionExterna[]>(`/api/admin/externas/catalogo?provincia=${provincia}`, 0);
  const [elegida, setElegida] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const centro = red ? { lat: red.red.lat, lon: red.red.lon } : { lat: 40.284, lon: -1.158 };
  const ahora = Math.floor(Date.now() / 1000);
  const ordenadas = useMemo(() => [...(lista ?? [])].sort((a, b) => distancia(a, centro) - distancia(b, centro)), [lista, centro.lat, centro.lon]);
  const sel = ordenadas.find((e) => e.codigo === elegida) ?? null;
  const anadidas = ordenadas.filter((e) => e.enMeteostar?.externa).length;

  const accion = async (e: EstacionExterna, anadir: boolean) => {
    setOcupado(true);
    setAviso(null);
    try {
      if (anadir) await enviar("/api/admin/externas", "POST", { codigo: e.codigo });
      else await enviar(`/api/admin/externas/${e.codigo}`, "DELETE");
      await recargar();
      setAviso(anadir ? `${e.nombre} añadida: sus datos aparecerán en unos minutos.` : `${e.nombre} quitada de Meteostar.`);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se ha podido hacer");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="tarjeta gestion-externas">
      <div className="externas-cabecera">
        <label>
          Provincia{" "}
          <select
            value={provincia}
            onChange={(ev) => {
              setProvincia(ev.target.value);
              setElegida(null);
            }}
          >
            {Object.entries(provincias ?? { ESARA44: "Teruel" }).map(([c, nombre]) => (
              <option key={c} value={c}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <span className="suave pequeno">
          {lista ? `${lista.length} estaciones de Meteoclimatic · ${anadidas} en Meteostar` : error ? "No se ha podido leer Meteoclimatic" : "Cargando…"}
        </span>
      </div>
      <p className="leyenda-rios suave pequeno">
        <i style={{ background: COLORES.anadida }} /> Añadida a Meteostar <i style={{ background: COLORES.red }} /> Es de tu red (ya está) <i style={{ background: COLORES.libre }} /> Disponible{" "}
        <i style={{ background: COLORES.vieja }} /> Sin datos en las últimas 3 h
      </p>

      <div className="externas-cuerpo">
        <div className="mapa" style={{ height: 420 }}>
          <MapContainer center={[centro.lat, centro.lon]} zoom={9} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <CircleMarker center={[centro.lat, centro.lon]} radius={5} pathOptions={{ color: "#1d2433", fillColor: "#1d2433", fillOpacity: 1 }}>
              <Tooltip>{red?.red.lugar ?? "Villastar"}</Tooltip>
            </CircleMarker>
            {ordenadas.map((e) => {
              const color = COLORES[estado(e, ahora)];
              return (
                <CircleMarker
                  key={e.codigo}
                  center={[e.lat, e.lon]}
                  radius={e.codigo === elegida ? 10 : 7}
                  pathOptions={{ color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }}
                  eventHandlers={{ click: () => setElegida(e.codigo) }}
                >
                  <Tooltip>
                    <b>{e.nombre}</b>
                    {e.temp !== null && ` · ${n(e.temp)} °C`}
                  </Tooltip>
                </CircleMarker>
              );
            })}
            <SinPrefijo />
          </MapContainer>
        </div>

        <div className="externas-ficha">
          {sel ? (
            <>
              <h3>{sel.nombre}</h3>
              <p className="suave pequeno mono">{sel.codigo}</p>
              <dl className="lista-datos">
                <div>
                  <dt>Distancia</dt>
                  <dd>{n(distancia(sel, centro), 0)} km</dd>
                </div>
                <div>
                  <dt>Último dato</dt>
                  <dd>{sel.t ? `${hace(ahora - sel.t)}${sel.temp !== null ? ` · ${n(sel.temp)} °C` : ""}` : "—"}</dd>
                </div>
                <div>
                  <dt>Calidad</dt>
                  <dd>{sel.qos === null ? "—" : sel.qos === 0 ? "Buena" : `Aviso de Meteoclimatic (${sel.qos})`}</dd>
                </div>
              </dl>
              {sel.enMeteostar && !sel.enMeteostar.externa ? (
                <p className="suave pequeno">
                  Es <a href={`/estacion/${sel.enMeteostar.slug}`}>{sel.enMeteostar.nombre}</a>, de tu red: ya está en Meteostar con sus datos directos.
                </p>
              ) : sel.enMeteostar ? (
                <div className="botones-ficha">
                  <a className="boton-secundario" href={`/estacion/${sel.enMeteostar.slug}`}>
                    Ver en Meteostar
                  </a>
                  <button className="boton-secundario peligro" disabled={ocupado} onClick={() => accion(sel, false)}>
                    Quitar
                  </button>
                </div>
              ) : (
                <button className="boton-principal" disabled={ocupado} onClick={() => accion(sel, true)}>
                  + Añadir a Meteostar
                </button>
              )}
              <p className="suave pequeno">
                <a href={`https://www.meteoclimatic.net/perfil/${sel.codigo}`} target="_blank" rel="noreferrer">
                  Ficha en Meteoclimatic
                </a>
              </p>
            </>
          ) : (
            <p className="suave">Pulsa una estación del mapa para verla y añadirla. Las más cercanas a {red?.red.lugar ?? "Villastar"} están en la lista de abajo.</p>
          )}
          {aviso && <p className="aviso-externas">{aviso}</p>}
        </div>
      </div>

      <div className="lista-externas">
        {ordenadas.slice(0, 15).map((e) => (
          <button key={e.codigo} className={e.codigo === elegida ? "activa" : ""} onClick={() => setElegida(e.codigo)}>
            <i style={{ background: COLORES[estado(e, ahora)] }} />
            <span>{e.nombre}</span>
            <small className="suave">{n(distancia(e, centro), 0)} km</small>
          </button>
        ))}
      </div>
      <p className="suave pequeno">
        Datos de{" "}
        <a href="https://www.meteoclimatic.net/" target="_blank" rel="noreferrer">
          Meteoclimatic
        </a>{" "}
        (CC BY-NC-ND 3.0). Se leen todas las estaciones de una provincia en una sola petición cada 10 minutos, así que añadir más no cuesta peticiones.
      </p>
    </div>
  );
}
