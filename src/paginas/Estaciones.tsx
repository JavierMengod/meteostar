// Estaciones: igual que las páginas de ríos y embalses. Arriba las que sigue el usuario; debajo, todas: las de
// Meteostar (de la red, oficiales y de otras redes dadas de alta) y, en el mapa y al final de la lista, todas las de
// Meteoclimatic de Teruel que aún no están dadas de alta (solo su último dato: no se guardan).
import { Fragment, lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { EstacionExterna, RespuestaDatos, RespuestaRed } from "../../shared/tipos";
import BotonSeguir from "../componentes/BotonSeguir";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import TarjetaEstacion from "../componentes/TarjetaEstacion";
import { enviar, usePeticion, useSesion } from "../datos";
import { COLOR_SIN_DATOS, ESCALA_TEMP, colorTemp, enDirecto } from "../estaciones";
import { hace, n } from "../formato";
import { useSeguidos } from "../seguidos";

const Mapa = lazy(() => import("../componentes/Mapa"));

type Seguidos = ReturnType<typeof useSeguidos>;

const quitarAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Color de los puntos de Weather Underground (su dato solo se pide al pulsarlos) */
const COLOR_AL_PULSAR = "#8c97a8";
const NOMBRE_RED = { meteoclimatic: "Meteoclimatic", wunderground: "Weather Underground", aemet: "AEMET" } as const;
const enlaceRed = (e: EstacionExterna) =>
  e.fuente === "meteoclimatic"
    ? `https://www.meteoclimatic.net/perfil/${e.codigo}`
    : e.fuente === "aemet"
      ? `https://www.aemet.es/es/eltiempo/observacion/ultimosdatos?l=${e.codigo}`
      : `https://www.wunderground.com/dashboard/pws/${e.codigo}`;

/** Estaciones de otras redes que puede dar de alta cada usuario (igual que en el servidor) */
const MAX_EXTERNAS_USUARIO = 5;

const GRUPOS = { particular: "Estaciones de la red", oficial: "Estaciones oficiales", externa: "Otras redes de aficionados" } as const;

/** Fila compacta de la lista de todas las estaciones. */
function FilaEstacion({ d, ahora, seg }: { d: RespuestaDatos; ahora: number; seg: Seguidos }) {
  const e = d.estacion;
  const directo = enDirecto(d, ahora);
  const temp = directo ? (d.actual?.temp ?? null) : null;
  return (
    <a href={`/estacion/${e.slug}`} className="fila-rio fila-estacion">
      <i className="punto-rio" style={{ background: colorTemp(temp) }} aria-hidden="true" />
      <span className="fila-rio-nombre">
        <b>{e.nombre}</b>
        <small className="suave">
          {e.tipo !== "particular" ? `${e.red ?? "Oficial"} · ` : ""}
          {e.municipio} · {e.altitud} m
        </small>
      </span>
      <span className="fila-rio-valor">
        <b>{temp === null ? "—" : n(temp)}</b> <small className="suave">°C</small>
      </span>
      <span className="fila-rio-estado">
        {directo ? (
          <span className="pastilla-normal en-directo">En directo</span>
        ) : (
          <span className="pastilla-normal" style={{ background: COLOR_SIN_DATOS }}>
            {d.actual ? `Sin datos ${hace(ahora - d.actual.ts)}` : "Sin datos"}
          </span>
        )}
        {directo && d.hoy && (
          <small className="suave minmax-fila">
            <b className="frio">{n(d.hoy.tmin)}°</b> / <b className="calor">{n(d.hoy.tmax)}°</b>
          </small>
        )}
      </span>
      {seg.usuario && <BotonSeguir activo={seg.sigue(e.slug)} ocupado={seg.ocupado === e.slug} onClick={() => seg.alternar(e.slug)} nombre={e.nombre} />}
    </a>
  );
}

/** Fila de una estación de Meteoclimatic sin dar de alta: al pulsarla se abre su ficha. */
function FilaLibre({ e, ahora, onElegir }: { e: EstacionExterna; ahora: number; onElegir: () => void }) {
  return (
    <button type="button" className="fila-rio fila-libre" onClick={onElegir}>
      <i
        className={`punto-rio ${e.fuente === "aemet" ? "oficial" : ""}`}
        style={{ background: e.fuente === "wunderground" && e.temp === null ? COLOR_AL_PULSAR : colorTemp(e.temp), opacity: e.fuente === "aemet" ? 1 : 0.6 }}
        aria-hidden="true"
      />
      <span className="fila-rio-nombre">
        <b>{e.nombre}</b>
        <small className="suave">
          {NOMBRE_RED[e.fuente]}
          {e.t ? ` · ${hace(ahora - e.t)}` : e.fuente === "wunderground" ? " · pulsa para ver su dato" : ""}
        </small>
      </span>
      <span className="fila-rio-valor">
        <b>{e.temp === null ? "—" : n(e.temp)}</b> <small className="suave">°C</small>
      </span>
      <span className="fila-rio-estado">
        {e.aviso ? (
          <span className="pastilla-normal aviso-calidad" title={e.aviso}>
            Puede medir mal
          </span>
        ) : (
          <span className="pastilla-normal" style={{ background: COLOR_SIN_DATOS }}>
            Sin dar de alta
          </span>
        )}
      </span>
    </button>
  );
}

/** Ficha de una estación de Meteoclimatic que no está dada de alta (sus datos no se guardan). */
function FichaLibre({
  e: base,
  ahora,
  usuario,
  onCerrar,
  onDato,
}: {
  e: EstacionExterna;
  ahora: number;
  /** Quién mira: cualquier usuario con cuenta puede darla de alta (con límite); sin cuenta, no */
  usuario: { rol: string } | null;
  onCerrar: () => void;
  /** Para que el mapa y la lista enseñen también el dato pedido */
  onDato: (codigo: string, dato: { t: number | null; temp: number | null }) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Weather Underground: el dato se pide al abrir la ficha (una petición de la clave, 10 minutos en caché)
  const [dato, setDato] = useState<{ t: number | null; temp: number | null } | null>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    setDato(null);
    setError(null);
    if (base.fuente !== "wunderground") return;
    setCargando(true);
    fetch(`/api/estaciones/wunderground/${base.codigo}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "No disponible");
        setDato(j);
        onDato(base.codigo, j);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No disponible"))
      .finally(() => setCargando(false));
  }, [base.codigo, base.fuente]);
  const e = dato ? { ...base, t: dato.t, temp: dato.temp } : base;
  const alta = async () => {
    setOcupado(true);
    setError(null);
    try {
      const r = await enviar<{ slug: string }>("/api/cuenta/externas", "POST", { codigo: e.codigo, fuente: e.fuente });
      // Recarga completa: así la red (menú, lista y mapa) ya la incluye
      location.href = `/estacion/${r.slug}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se ha podido dar de alta");
      setOcupado(false);
    }
  };
  return (
    <section className="tarjeta ficha-libre" id="ficha-libre">
      <div className="tarjeta-rio-cabecera">
        <div>
          <h3>{e.nombre}</h3>
          <p className="suave pequeno">{NOMBRE_RED[e.fuente]} · sin dar de alta en Meteostar</p>
        </div>
        <button type="button" className="boton-cerrar" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>
      </div>
      <p className="numero-medio" style={{ color: colorTemp(e.temp) }}>
        {e.temp === null ? "—" : n(e.temp)}
        <sup>°C</sup>
      </p>
      {e.aviso && (
        <p className="aviso-externas">
          ⚠ <b>Puede medir mal:</b> {e.aviso.charAt(0).toLowerCase() + e.aviso.slice(1)}.
        </p>
      )}
      {e.gemela && (
        <p className="suave pequeno">
          Es la misma estación que <b>{e.gemela}</b> en {e.fuente === "meteoclimatic" ? "Weather Underground" : "Meteoclimatic"} (dan la misma máxima y
          mínima).{e.fuente === "meteoclimatic" ? " Al darla de alta, su histórico se traerá de allí." : ""}
        </p>
      )}
      <p className="suave pequeno">
        {cargando ? "Pidiendo su dato a Weather Underground…" : e.t ? `Dato de ${NOMBRE_RED[e.fuente]} ${hace(ahora - e.t)}` : "Sin datos ahora mismo"}. Sus datos no
        se guardan en Meteostar: solo se ve el último. Para tener sus gráficas y su histórico hay que darla de alta{e.fuente === "wunderground" ? " (el de años atrás se traerá de Weather Underground)" : ""}.
      </p>
      <div className="botones-ficha">
        {usuario ? (
          <button type="button" className="boton-principal" disabled={ocupado} onClick={alta}>
            {ocupado ? "Dando de alta…" : "+ Dar de alta en Meteostar"}
          </button>
        ) : (
          <a className="boton-principal" href="/entrar">
            Entra para darla de alta
          </a>
        )}
        <a className="boton-secundario" href={enlaceRed(e)} target="_blank" rel="noreferrer">
          Ver en {NOMBRE_RED[e.fuente]}
        </a>
      </div>
      {usuario && usuario.rol !== "admin" && (
        <p className="suave pequeno">Cada usuario puede dar de alta hasta {MAX_EXTERNAS_USUARIO} estaciones de otras redes; las puede quitar desde su cuenta.</p>
      )}
      {error && <p className="aviso-externas">{error}</p>}
    </section>
  );
}

/** Un grupo de la lista que se abre y se cierra. */
function Grupo({
  titulo,
  resumen,
  abierto,
  onCambio,
  children,
}: {
  titulo: string;
  resumen: string;
  abierto: boolean;
  onCambio: (abierto: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <details className="tarjeta lista-rios" open={abierto} onToggle={(ev) => onCambio((ev.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="titulo-grupo">{titulo}</span>
        <span className="suave pequeno">{resumen}</span>
      </summary>
      {children}
    </details>
  );
}

export default function Estaciones({ red }: { red: RespuestaRed | null }) {
  const seg = useSeguidos("estacion", red?.porDefecto ?? []);
  const usuario = useSesion().usuario;
  const admin = usuario?.rol === "admin";
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  // Grupos abiertos a mano; al buscar o filtrar se abren todos los que tengan resultados
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  // Todas las de Meteoclimatic de Teruel, con su dato actual (las que no están dadas de alta no se guardan)
  const { datos: catalogo } = usePeticion<EstacionExterna[]>("/api/estaciones/meteoclimatic", 5 * 60_000);
  const [elegida, setElegida] = useState<string | null>(null);
  // Datos de Weather Underground ya pedidos al abrir sus fichas
  const [pedidos, setPedidos] = useState<Record<string, { t: number | null; temp: number | null }>>({});
  const estaciones = red?.estaciones ?? [];
  const q = quitarAcentos(busca.trim());
  const filtradas = useMemo(
    () => estaciones.filter((d) => (!tipo || d.estacion.tipo === tipo) && (!q || quitarAcentos(`${d.estacion.nombre} ${d.estacion.municipio} ${d.estacion.red ?? ""}`).includes(q))),
    [estaciones, q, tipo],
  );
  const { datos: listaWU } = usePeticion<EstacionExterna[]>("/api/estaciones/wunderground", 60 * 60_000);
  // Las oficiales de AEMET de la zona, con su último dato (horario)
  const { datos: listaAemet } = usePeticion<EstacionExterna[]>("/api/estaciones/aemet", 10 * 60_000);
  const libres = useMemo(() => {
    const mc = (catalogo ?? []).filter((e) => !e.enMeteostar);
    // Para quitar de Weather Underground las que ya salen por Meteoclimatic o están en Meteostar
    // Las de Weather Underground que son la misma estación que una de Meteoclimatic (gemelas comprobadas) no se repiten:
    // queda la de Meteoclimatic, que no gasta peticiones
    const wu = (listaWU ?? []).filter((e) => !e.enMeteostar && !e.gemela);
    const aemet = (listaAemet ?? []).filter((e) => !e.enMeteostar);
    return [...aemet, ...mc, ...wu.map((e) => (pedidos[e.codigo] ? { ...e, ...pedidos[e.codigo] } : e))];
  }, [catalogo, listaWU, listaAemet, estaciones, pedidos]);
  // Filtro por tipo: las de AEMET van con las oficiales; las demás, con «otras redes»
  const libresFiltradas = useMemo(
    () =>
      libres.filter(
        (e) => (!tipo || tipo === (e.fuente === "aemet" ? "oficial" : "externa")) && (!q || quitarAcentos(`${e.nombre} ${NOMBRE_RED[e.fuente]}`).includes(q)),
      ),
    [libres, q, tipo],
  );
  if (!red) return <Cargando />;
  const { ahora } = red;

  const destacadas = seg.destacados.map((slug) => estaciones.find((d) => d.estacion.slug === slug)).filter((d): d is RespuestaDatos => !!d);
  // Misma escala de temperatura en todas las tarjetas, para poder compararlas
  const extremos = destacadas.flatMap((d) => [d.hoy?.tmin, d.hoy?.tmax, d.actual?.temp]).filter((v): v is number => typeof v === "number");
  const escala: [number, number] | undefined = extremos.length ? [Math.min(...extremos) - 2, Math.max(...extremos) + 2] : undefined;
  const grupos = (["particular", "oficial", "externa"] as const).map((t) => [t, filtradas.filter((d) => d.estacion.tipo === t)] as const).filter(([, l]) => l.length);
  const libreElegida = libres.find((e) => e.codigo === elegida) ?? null;
  const total = filtradas.length + libresFiltradas.length;
  // En la lista, las oficiales de AEMET en su propio grupo, separadas de las de aficionados
  const libresAemet = libresFiltradas.filter((e) => e.fuente === "aemet");
  const libresAficionados = libresFiltradas.filter((e) => e.fuente !== "aemet");
  const abierto = (clave: string) => !!q || !!tipo || abiertos.has(clave);
  const cambiar = (clave: string) => (a: boolean) =>
    setAbiertos((prev) => {
      const nuevo = new Set(prev);
      if (a) nuevo.add(clave);
      else nuevo.delete(clave);
      return nuevo;
    });
  const elegir = (codigo: string) => {
    setElegida(codigo);
    // La ficha sale debajo del mapa
    setTimeout(() => document.getElementById("ficha-libre")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };

  return (
    <>
      <section className="cabecera-embalses">
        <h1>Estaciones</h1>
        <p className="suave">
          Las estaciones meteorológicas de la zona: las de Meteostar, las oficiales de AEMET y las de aficionados que publican en Meteoclimatic y Weather Underground. Pulsa una estación para ver sus datos;
          las dadas de alta en Meteostar tienen además sus gráficas y su histórico.
        </p>
      </section>

      {destacadas.length > 0 && (
        <>
          <CabeceraSeccion
            titulo={seg.sonPropios ? "Tus estaciones" : "Destacada"}
            nota={
              seg.usuario
                ? seg.sonPropios
                  ? "Las que sigues (☆ para añadir o quitar)"
                  : "Pulsa ☆ en cualquier estación para tenerla aquí"
                : "Entra en tu cuenta para elegir las estaciones que ves aquí"
            }
          />
          <div className="rejilla-3">
            {destacadas.map((d) => (
              <TarjetaEstacion
                key={d.estacion.slug}
                d={d}
                escala={escala}
                accion={
                  seg.usuario && (
                    <BotonSeguir
                      activo={seg.sigue(d.estacion.slug)}
                      ocupado={seg.ocupado === d.estacion.slug}
                      onClick={() => seg.alternar(d.estacion.slug)}
                      nombre={d.estacion.nombre}
                    />
                  )
                }
              />
            ))}
          </div>
        </>
      )}

      <CabeceraSeccion titulo="Todas las estaciones" nota={`${estaciones.length} en Meteostar${libres.length ? ` · ${libres.length} más en otras redes` : ""}`} />
      <p className="anadir-admin">
        <a className="boton-secundario" href={admin ? "/admin#otras-redes" : usuario ? "/cuenta/estacion/nueva" : "/entrar"}>
          + {admin ? "Añadir o gestionar estaciones" : "Añade tu estación"}
        </a>
        <small className="suave">
          {admin
            ? "Solo lo ves tú, como administrador. También puedes pulsar cualquier estación sin dar de alta y darla de alta."
            : usuario
              ? `¿Tienes una estación? Súmala a la red. También puedes dar de alta hasta ${MAX_EXTERNAS_USUARIO} de otras redes: pulsa una del mapa.`
              : "¿Tienes una estación? Entra con tu cuenta para sumarla a la red, o para dar de alta las de otras redes."}
        </small>
      </p>
      {estaciones.length + libres.length > 4 && (
        <div className="filtros-rios">
          <input type="search" value={busca} placeholder="Buscar una estación o un pueblo…" onChange={(e) => setBusca(e.target.value)} aria-label="Buscar una estación" />
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de estación">
            <option value="">Todas</option>
            <option value="particular">De la red</option>
            <option value="oficial">Oficiales</option>
            <option value="externa">Otras redes</option>
          </select>
        </div>
      )}

      {total > 0 && (
        <Suspense fallback={<div className="mapa" />}>
          <Mapa
            alto={420}
            margen={0.08}
            pequeno
            soloFijos={total > 8}
            puntos={[
              // Las que no están dadas de alta: apagadas y, al pulsarlas, su ficha aquí debajo
              ...libresFiltradas.map((e) => ({
                lat: e.lat,
                lon: e.lon,
                nombre: e.nombre,
                valor: e.temp,
                href: `${e.fuente}:${e.codigo}`,
                color: e.fuente === "wunderground" && e.temp === null ? COLOR_AL_PULSAR : colorTemp(e.temp),
                // Las de AEMET, cuadradas y sin apagar (son de referencia); las de aficionados, apagadas
                atenuado: e.fuente !== "aemet",
                oficial: e.fuente === "aemet",
                // Las de Weather Underground sin dato (hasta que se pulsan): pequeñas y por debajo de las que sí lo tienen
                discreto: e.temp === null,
                fijo: e.codigo === elegida,
                alPulsar: () => elegir(e.codigo),
              })),
              ...filtradas.map((d) => {
                const temp = enDirecto(d, ahora) ? (d.actual?.temp ?? null) : null;
                return {
                  lat: d.estacion.lat,
                  lon: d.estacion.lon,
                  nombre: d.estacion.nombre,
                  valor: temp,
                  href: `/estacion/${d.estacion.slug}`,
                  oficial: d.estacion.tipo === "oficial",
                  color: colorTemp(temp),
                  fijo: seg.destacados.includes(d.estacion.slug),
                };
              }),
            ]}
          />
        </Suspense>
      )}
      <p className="leyenda-rios suave pequeno">
        {ESCALA_TEMP.map(([, color, texto]) => (
          <Fragment key={texto}>
            <i style={{ background: color }} /> {texto}{" "}
          </Fragment>
        ))}
        <i style={{ background: COLOR_SIN_DATOS }} /> Sin datos <i className="leyenda-oficial" /> Oficial (AEMET) <i className="leyenda-libre" /> Sin dar de alta <i className="leyenda-libre" style={{ background: COLOR_AL_PULSAR }} />{" "}
        Weather Underground (dato al pulsar)
      </p>
      {libreElegida && <FichaLibre e={libreElegida} ahora={ahora} usuario={usuario ?? null} onCerrar={() => setElegida(null)} onDato={(c, d) => setPedidos((p) => ({ ...p, [c]: d }))} />}

      {total > 0 ? (
        <>
          {grupos.map(([t, lista]) => (
            <Grupo
              key={t}
              titulo={GRUPOS[t]}
              resumen={`${lista.length} ${lista.length === 1 ? "estación" : "estaciones"} · ${lista.filter((d) => enDirecto(d, ahora)).length} en directo`}
              abierto={abierto(t)}
              onCambio={cambiar(t)}
            >
              {lista.map((d) => (
                <FilaEstacion key={d.estacion.slug} d={d} ahora={ahora} seg={seg} />
              ))}
            </Grupo>
          ))}
          {libresAemet.length > 0 && (
            <Grupo
              titulo="Oficiales de AEMET"
              resumen={`${libresAemet.length} sin dar de alta · ${libresAemet.filter((e) => e.temp !== null).length} con dato · se actualizan cada hora`}
              abierto={abierto("aemet")}
              onCambio={cambiar("aemet")}
            >
              {libresAemet.map((e) => (
                <FilaLibre key={e.codigo} e={e} ahora={ahora} onElegir={() => elegir(e.codigo)} />
              ))}
            </Grupo>
          )}
          {libresAficionados.length > 0 && (
            <Grupo
              titulo="Más estaciones de aficionados"
              resumen={`${libresAficionados.length} sin dar de alta · Meteoclimatic y Weather Underground`}
              abierto={abierto("libres")}
              onCambio={cambiar("libres")}
            >
              {libresAficionados.map((e) => (
                <FilaLibre key={e.codigo} e={e} ahora={ahora} onElegir={() => elegir(e.codigo)} />
              ))}
            </Grupo>
          )}
        </>
      ) : (
        <p className="vacio">{estaciones.length + libres.length ? "Ninguna estación coincide con la búsqueda." : "Todavía no hay estaciones."}</p>
      )}

      <p className="pie-fuente">
        Datos: las estaciones de los usuarios de la red, en directo · Otras redes:{" "}
        <a href="https://www.meteoclimatic.net/" target="_blank" rel="noreferrer">
          Meteoclimatic
        </a>{" "}
        (CC BY-NC-ND) y{" "}
        <a href="https://www.wunderground.com/" target="_blank" rel="noreferrer">
          Weather Underground
        </a>{" "}
        · Oficiales:{" "}
        <a href="https://opendata.aemet.es/" target="_blank" rel="noreferrer">
          AEMET OpenData
        </a>{" "}
        · <a href="/fuentes">Fuentes</a>
      </p>
    </>
  );
}
