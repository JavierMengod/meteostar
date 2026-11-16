// Radar (RainViewer) y satélite (EUMETSAT MTG) animados sobre un mapa, con selector de momento.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { ImageOverlay, MapContainer, Marker, TileLayer } from "react-leaflet";
import SinPrefijo from "../componentes/SinPrefijo";
import type { RespuestaDatos, RespuestaRadar, RespuestaRed, RespuestaSatelite } from "../../shared/tipos";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import { usePeticion } from "../datos";
import { DURACIONES_RADAR, elegirImagenes } from "../../shared/radar";
import { diaHora, hora, n } from "../formato";

/** Reproductor de fotogramas: avanza solo y se detiene un momento en el último. */
function useAnimacion(total: number, activa = true) {
  const [i, setI] = useState(Math.max(0, total - 1));
  const [jugando, setJugando] = useState(true);
  useEffect(() => setI(Math.max(0, total - 1)), [total]);
  useEffect(() => {
    if (!jugando || !activa || total < 2) return;
    const espera = i === total - 1 ? 1800 : 550;
    const id = setTimeout(() => setI((x) => (x + 1) % total), espera);
    return () => clearTimeout(id);
  }, [i, jugando, activa, total]);
  return { i: Math.min(i, Math.max(0, total - 1)), setI, jugando, setJugando };
}

/** Precarga imágenes y cuenta cuántas han llegado (o fallado). */
function usePrecarga(urls: string[]) {
  const clave = urls.join("|");
  const [estado, setEstado] = useState<{ clave: string; ok: Set<string>; fallo: Set<string> }>({ clave, ok: new Set(), fallo: new Set() });
  useEffect(() => {
    let vivo = true;
    const ok = new Set<string>();
    const fallo = new Set<string>();
    setEstado({ clave, ok, fallo });
    for (const url of clave ? clave.split("|") : []) {
      const img = new Image();
      img.onload = () => {
        if (!vivo) return;
        ok.add(url);
        setEstado({ clave, ok: new Set(ok), fallo });
      };
      img.onerror = () => {
        if (!vivo) return;
        fallo.add(url);
        setEstado({ clave, ok, fallo: new Set(fallo) });
      };
      img.src = url;
    }
    return () => {
      vivo = false;
    };
  }, [clave]);
  const actual = estado.clave === clave ? estado : { ok: new Set<string>(), fallo: new Set<string>() };
  return { ok: actual.ok, fallo: actual.fallo, listo: actual.ok.size + actual.fallo.size >= urls.length };
}

function Controles({ anim, total, etiqueta }: { anim: ReturnType<typeof useAnimacion>; total: number; etiqueta: string }) {
  const mover = (d: number) => {
    if (!total) return;
    anim.setJugando(false);
    anim.setI((anim.i + d + total) % total);
  };
  return (
    <div className="controles">
      <button onClick={() => anim.setJugando(!anim.jugando)} aria-label={anim.jugando ? "Pausar" : "Reproducir"}>
        {anim.jugando ? "❚❚" : "▶"}
      </button>
      <button onClick={() => mover(-1)} aria-label="Imagen anterior">
        ‹
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={anim.i}
        onChange={(e) => {
          anim.setJugando(false);
          anim.setI(Number(e.target.value));
        }}
        aria-label="Momento"
      />
      <button onClick={() => mover(1)} aria-label="Imagen siguiente">
        ›
      </button>
      <span className="mono controles-hora">{etiqueta}</span>
    </div>
  );
}

function Chips<T extends string | number>({ opciones, valor, cambiar }: { opciones: [T, string][]; valor: T; cambiar: (v: T) => void }) {
  return (
    <div className="periodos" role="tablist">
      {opciones.map(([v, t]) => (
        <button key={String(v)} role="tab" aria-selected={valor === v} onClick={() => cambiar(v)}>
          {t}
        </button>
      ))}
    </div>
  );
}

function iconoEstacion(nombre: string) {
  return L.divIcon({ className: "marcador-simple", html: `<span><i></i>${nombre}</span>`, iconSize: [0, 0] });
}

// ===== Radar =====

const RANGOS_RADAR: [number, string][] = DURACIONES_RADAR.map(([m, nombre]) => [m, nombre]);

/** Estado de la lluvia según la intensidad (mm/h). */
const estadoLluvia = (i: number | null | undefined) =>
  !i ? "Sin precipitación" : i >= 15 ? "Lluvia muy fuerte" : i >= 7.5 ? "Lluvia fuerte" : i >= 2.5 ? "Lluvia moderada" : "Lluvia débil";

/** Marcadores pequeños con el nombre de cada estación. */
function Marcadores({ estaciones }: { estaciones: RespuestaDatos[] }) {
  return (
    <>
      {estaciones.map((d) => (
        <Marker key={d.estacion.id} position={[d.estacion.lat, d.estacion.lon]} icon={iconoEstacion(d.estacion.nombre)} />
      ))}
    </>
  );
}

export function Radar({ red }: { red: RespuestaRed }) {
  const { datos: r, error } = usePeticion<RespuestaRadar>("/api/radar", 5 * 60_000);
  const [minutos, setMinutos] = useState(180);
  const paso = DURACIONES_RADAR.find(([m]) => m === minutos)?.[2] ?? 10;
  const imagenes = useMemo(() => elegirImagenes(r?.imagenes ?? [], minutos, paso), [r, minutos, paso]);
  // ¿Hay archivo suficiente para toda la duración elegida?
  const primera = r?.imagenes[0]?.t;
  const ultima = r?.imagenes[r.imagenes.length - 1]?.t;
  const incompleto = primera !== undefined && ultima !== undefined && primera > ultima - minutos * 60 + paso * 60;
  const total = imagenes.length;
  const anim = useAnimacion(total);
  // Las estaciones con datos de lluvia, primero las que más llueve
  const conLluvia = red.estaciones
    .filter((d) => d.actual && d.actual.lluvia_dia !== null && red.ahora - d.actual.ts < 5400)
    .sort((a, b) => (b.actual!.intensidad ?? 0) - (a.actual!.intensidad ?? 0) || (b.actual!.lluvia_dia ?? 0) - (a.actual!.lluvia_dia ?? 0));
  const llueve = conLluvia.filter((d) => (d.actual!.intensidad ?? 0) > 0);
  const maxHoy = Math.max(0, ...conLluvia.map((d) => d.actual!.lluvia_dia ?? 0));

  return (
    <>
      <CabeceraSeccion titulo="Radar de precipitación" nota={`Lo que está lloviendo ahora mismo alrededor de ${red.red.lugar}`} />
      <div className="selector-momento">
        <span className="selector-etiqueta">Duración</span>
        <Chips opciones={RANGOS_RADAR} valor={minutos} cambiar={setMinutos} />
        {incompleto && <span className="suave pequeno">Hay radar guardado desde las {hora(primera!)}</span>}
      </div>
      <div className="seguimiento">
        <section className="tarjeta mapa-anim">
          {!r || !total ? (
            <Cargando error={error} />
          ) : (
            <>
              <div className="mapa grande">
                <MapContainer
                  center={[red.red.lat, red.red.lon]}
                  zoom={7}
                  minZoom={7}
                  maxZoom={10}
                  maxBounds={r.zona}
                  maxBoundsViscosity={0.8}
                  scrollWheelZoom={false}
                  style={{ height: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {imagenes.map((img, k) => (
                    <TileLayer
                      key={img.t}
                      url={img.url}
                      opacity={k === anim.i ? 0.75 : 0}
                      maxNativeZoom={7}
                      zIndex={10}
                      attribution='<a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>'
                    />
                  ))}
                  <Marcadores estaciones={red.estaciones} />
                  <SinPrefijo />
                </MapContainer>
              </div>
              <Controles anim={anim} total={total} etiqueta={diaHora(imagenes[anim.i].t)} />
            </>
          )}
        </section>

        <aside className="seguimiento-lado">
          <section className="tarjeta">
            <h3>Precipitación ahora en la red</h3>
            <div className="ahora-lluvia">
              <span className={llueve.length ? "gota activa" : "gota"}>💧</span>
              <div>
                <b>{llueve.length ? `Llueve en ${llueve.length} ${llueve.length === 1 ? "estación" : "estaciones"}` : "No llueve"}</b>
                <small>{llueve.length ? "según las estaciones" : "en ninguna estación ahora mismo"}</small>
              </div>
              <div className="derecha">
                <b className="lluvia">{n(maxHoy)} mm</b>
                <small>máximo de hoy</small>
              </div>
            </div>
            <ul className="lista-lluvia">
              {conLluvia.map((d) => (
                <li key={d.estacion.id}>
                  <a href={`/estacion/${d.estacion.slug}`}>
                    <b>{d.estacion.nombre}</b> <small className="mono">{hora(d.actual!.ts)}</small>
                  </a>
                  <span className={d.actual!.intensidad ? "lluvia" : "suave"}>{estadoLluvia(d.actual!.intensidad)}</span>
                  <div className="barra-lluvia">
                    <i style={{ width: `${maxHoy ? ((d.actual!.lluvia_dia ?? 0) / maxHoy) * 100 : 0}%` }} />
                  </div>
                  <small>{n(d.actual!.lluvia_dia)} mm hoy</small>
                </li>
              ))}
            </ul>
          </section>
          <section className="tarjeta">
            <h3>Cómo leer el radar</h3>
            <p className="suave">
              El radar detecta las gotas y copos que hay en el aire. Los colores claros son precipitación débil y los intensos,
              fuerte. Al reproducir la animación se ve hacia dónde se mueven los núcleos.
            </p>
            <p className="suave">
              Las zonas montañosas pueden quedar "a la sombra" del radar, y a veces aparecen ecos falsos. La estación confirma si
              realmente llueve.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

// ===== Satélite =====

type IdCapa = "color" | "infrarrojo";
const CAPAS: [IdCapa, string][] = [
  ["color", "Color"],
  ["infrarrojo", "Infrarrojo"],
];
const DURACIONES: [number, string][] = [
  [1, "1 h"],
  [3, "3 h"],
  [6, "6 h"],
  [12, "12 h"],
  [24, "24 h"],
];

/** Valor para <input type="datetime-local"> en hora local del navegador */
const aLocal = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function Satelite({ red }: { red: RespuestaRed }) {
  const [capa, setCapa] = useState<IdCapa>("color");
  const [horas, setHoras] = useState(3);
  /** Final de la animación (ms) o null = ahora */
  const [hasta, setHasta] = useState<number | null>(null);
  const [verFecha, setVerFecha] = useState(false);
  const url = `/api/satelite?capa=${capa}&horas=${horas}${hasta ? `&hasta=${new Date(hasta).toISOString()}` : ""}`;
  const { datos: s, error } = usePeticion<RespuestaSatelite>(url, hasta ? 0 : 10 * 60_000);
  const vigente = s && s.capa === capa ? s : null;
  const pedidas = vigente?.imagenes ?? [];
  const carga = usePrecarga(pedidas.map((i) => i.url));
  // Solo se animan las que han llegado bien
  const imagenes = pedidas.filter((i) => carga.ok.has(i.url));
  const total = imagenes.length;
  const anim = useAnimacion(total, carga.listo);
  const ultima = vigente ? Date.parse(vigente.ultima) : Date.now();
  const primera = vigente ? Date.parse(vigente.primera) : 0;
  // En "ahora", el final es la última imagen disponible (la de color va 1-2 h por detrás)
  const fin = hasta ?? (pedidas.length ? Date.parse(pedidas[pedidas.length - 1].t) : ultima);

  const volverAhora = () => {
    setHasta(null);
    setVerFecha(false);
  };

  return (
    <>
      <CabeceraSeccion titulo="Satélite" nota="Las nubes vistas desde el espacio" />
      <div className="selector-momento">
        <Chips opciones={CAPAS} valor={capa} cambiar={setCapa} />
        <Chips opciones={DURACIONES} valor={horas} cambiar={setHoras} />
        {verFecha ? (
          <span className="otra-fecha">
            <input
              type="datetime-local"
              value={aLocal(fin)}
              min={aLocal(primera)}
              max={aLocal(ultima)}
              step={600}
              onChange={(e) => {
                const v = Date.parse(e.target.value);
                if (!Number.isNaN(v)) setHasta(v >= ultima ? null : v);
              }}
              aria-label="Ver hasta esta fecha y hora"
            />
            <button className="enlace-boton" onClick={volverAhora}>
              Volver a ahora
            </button>
          </span>
        ) : (
          <button className="enlace-boton pequeno" onClick={() => setVerFecha(true)}>
            Ver otra fecha
          </button>
        )}
      </div>

      <section className="tarjeta mapa-anim">
        {!vigente ? (
          <Cargando error={error} />
        ) : (
          <>
            <div className="mapa grande satelite">
              <MapContainer
                bounds={vigente.limites}
                maxBounds={vigente.limites}
                maxBoundsViscosity={1}
                zoomSnap={0.25}
                zoomDelta={0.5}
                maxZoom={8}
                scrollWheelZoom={false}
                style={{ height: "100%" }}
              >
                {imagenes.map((img, k) => (
                  <ImageOverlay
                    key={img.url}
                    url={img.url}
                    bounds={vigente.limites}
                    opacity={k === anim.i ? 1 : 0}
                    attribution='<a href="https://view.eumetsat.int/" target="_blank">EUMETSAT</a>'
                  />
                ))}
                <ImageOverlay url="/satelite-costas.png" bounds={vigente.limites} zIndex={5} />
                <Marcadores estaciones={red.estaciones} />
                <SinPrefijo />
              </MapContainer>
              {!carga.listo && (
                <div className="progreso">
                  <b>
                    Cargando imágenes: {carga.ok.size + carga.fallo.size} de {pedidas.length}
                  </b>
                  <div className="barra-progreso">
                    <i style={{ width: `${((carga.ok.size + carga.fallo.size) / Math.max(1, pedidas.length)) * 100}%` }} />
                  </div>
                  <small>Las de fechas pasadas se descargan de EUMETSAT y pueden tardar unos segundos cada una.</small>
                </div>
              )}
              {carga.listo && total === 0 && (
                <div className="progreso">
                  <b>No hay imágenes para ese momento</b>
                  <small>Prueba con otra hora o con el infrarrojo.</small>
                </div>
              )}
            </div>
            <Controles anim={anim} total={total} etiqueta={total ? diaHora(Date.parse(imagenes[anim.i].t) / 1000) : "—"} />
          </>
        )}
      </section>
    </>
  );
}
