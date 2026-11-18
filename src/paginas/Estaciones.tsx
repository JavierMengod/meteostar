// Estaciones: igual que las páginas de ríos y embalses. Arriba las que sigue el usuario (sin cuenta, la de la web:
// Villastar); debajo, todas las estaciones con buscador, filtro, mapa y lista desplegable (las de la red y las oficiales).
import { Fragment, lazy, Suspense, useMemo, useState } from "react";
import type { RespuestaDatos, RespuestaRed } from "../../shared/tipos";
import BotonSeguir from "../componentes/BotonSeguir";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import TarjetaEstacion from "../componentes/TarjetaEstacion";
import { useSesion } from "../datos";
import { COLOR_SIN_DATOS, ESCALA_TEMP, colorTemp, enDirecto } from "../estaciones";
import { hace, n } from "../formato";
import { useSeguidos } from "../seguidos";

const Mapa = lazy(() => import("../componentes/Mapa"));

type Seguidos = ReturnType<typeof useSeguidos>;

const quitarAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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

/** Un grupo de la lista que se abre y se cierra. */
function GrupoEstaciones({
  titulo,
  lista,
  ahora,
  seg,
  abierto,
  onCambio,
}: {
  titulo: string;
  lista: RespuestaDatos[];
  ahora: number;
  seg: Seguidos;
  abierto: boolean;
  onCambio: (abierto: boolean) => void;
}) {
  const directo = lista.filter((d) => enDirecto(d, ahora)).length;
  return (
    <details className="tarjeta lista-rios" open={abierto} onToggle={(ev) => onCambio((ev.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="titulo-grupo">{titulo}</span>
        <span className="suave pequeno">
          {lista.length} {lista.length === 1 ? "estación" : "estaciones"} · {directo} en directo
        </span>
      </summary>
      {lista.map((d) => (
        <FilaEstacion key={d.estacion.slug} d={d} ahora={ahora} seg={seg} />
      ))}
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
  const estaciones = red?.estaciones ?? [];
  const filtradas = useMemo(() => {
    const q = quitarAcentos(busca.trim());
    return estaciones.filter(
      (d) => (!tipo || d.estacion.tipo === tipo) && (!q || quitarAcentos(`${d.estacion.nombre} ${d.estacion.municipio} ${d.estacion.red ?? ""}`).includes(q)),
    );
  }, [estaciones, busca, tipo]);
  if (!red) return <Cargando />;
  const { ahora } = red;

  const destacadas = seg.destacados.map((slug) => estaciones.find((d) => d.estacion.slug === slug)).filter((d): d is RespuestaDatos => !!d);
  // Misma escala de temperatura en todas las tarjetas, para poder compararlas
  const extremos = destacadas.flatMap((d) => [d.hoy?.tmin, d.hoy?.tmax, d.actual?.temp]).filter((v): v is number => typeof v === "number");
  const escala: [number, number] | undefined = extremos.length ? [Math.min(...extremos) - 2, Math.max(...extremos) + 2] : undefined;
  const grupos = (["particular", "oficial", "externa"] as const).map((t) => [t, filtradas.filter((d) => d.estacion.tipo === t)] as const).filter(([, l]) => l.length);
  const hayOtras = estaciones.some((d) => d.estacion.tipo !== "particular");

  return (
    <>
      <section className="cabecera-embalses">
        <h1>Estaciones</h1>
        <p className="suave">
          Las estaciones de la red, de aficionados de la zona; las oficiales cercanas, y otras de aficionados que publican en Meteoclimatic. Pulsa una estación para ver todos sus datos, sus gráficas y su histórico.
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

      <CabeceraSeccion titulo="Todas las estaciones" nota={`${estaciones.length} ${estaciones.length === 1 ? "estación" : "estaciones"}`} />
      <p className="anadir-admin">
        <a className="boton-secundario" href={admin ? "/admin" : usuario ? "/cuenta/estacion/nueva" : "/entrar"}>
          + {admin ? "Añadir o gestionar estaciones" : "Añade tu estación"}
        </a>
        <small className="suave">{admin ? "Solo lo ves tú, como administrador." : usuario ? "¿Tienes una estación? Súmala a la red." : "¿Tienes una estación? Entra con tu cuenta para sumarla a la red."}</small>
      </p>
      {estaciones.length > 4 && (
        <div className="filtros-rios">
          <input type="search" value={busca} placeholder="Buscar una estación o un pueblo…" onChange={(e) => setBusca(e.target.value)} aria-label="Buscar una estación" />
          {hayOtras && (
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de estación">
              <option value="">Todas</option>
              <option value="particular">De la red</option>
              <option value="oficial">Oficiales</option>
              <option value="externa">Otras redes</option>
            </select>
          )}
        </div>
      )}

      {filtradas.length > 0 && (
        <Suspense fallback={<div className="mapa" />}>
          <Mapa
            alto={420}
            margen={0.15}
            pequeno
            soloFijos={filtradas.length > 8}
            puntos={filtradas.map((d) => {
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
            })}
          />
        </Suspense>
      )}
      <p className="leyenda-rios suave pequeno">
        {ESCALA_TEMP.map(([, color, texto]) => (
          <Fragment key={texto}>
            <i style={{ background: color }} /> {texto}{" "}
          </Fragment>
        ))}
        <i style={{ background: COLOR_SIN_DATOS }} /> Sin datos
      </p>

      {grupos.length ? (
        grupos.map(([t, lista]) => (
          <GrupoEstaciones
            key={t}
            titulo={GRUPOS[t]}
            lista={lista}
            ahora={ahora}
            seg={seg}
            abierto={!!busca.trim() || !!tipo || abiertos.has(t)}
            onCambio={(abierto) =>
              setAbiertos((prev) => {
                const nuevo = new Set(prev);
                if (abierto) nuevo.add(t);
                else nuevo.delete(t);
                return nuevo;
              })
            }
          />
        ))
      ) : (
        <p className="vacio">{estaciones.length ? "Ninguna estación coincide con la búsqueda." : "Todavía no hay estaciones en la red."}</p>
      )}

      <p className="pie-fuente">
        Datos: las estaciones de los usuarios de la red, en directo · Oficiales:{" "}
        <a href="https://opendata.aemet.es/" target="_blank" rel="noreferrer">
          AEMET OpenData
        </a>{" "}
        (© AEMET, datos horarios) · Otras redes:{" "}
        <a href="https://www.meteoclimatic.net/" target="_blank" rel="noreferrer">
          Meteoclimatic
        </a>{" "}
        (CC BY-NC-ND) · <a href="/fuentes">Fuentes</a>
      </p>
    </>
  );
}
