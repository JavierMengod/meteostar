// Embalses: igual que la página de ríos. Arriba los que sigue el usuario (sin cuenta, los de por defecto: Arquillo
// de San Blas); debajo, todos los embalses configurados con buscador, filtro por cuenca, mapa y lista desplegable.
// Datos del boletín semanal del MITECO y, si lo hay, el dato reciente del SAIH (vía MapasDeEmbalses.es).
import { lazy, Suspense, useMemo, useState } from "react";
import type { Embalse, RespuestaEmbalses } from "../../shared/tipos";
import BotonSeguir from "../componentes/BotonSeguir";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import { usePeticion, useSesion } from "../datos";
import { colorEmbalse } from "../embalses";
import { conSigno, fechaCompleta, hora, n, nombreMes } from "../formato";
import { useSeguidos } from "../seguidos";

const Mapa = lazy(() => import("../componentes/Mapa"));

type Seguidos = ReturnType<typeof useSeguidos>;

const quitarAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const mesAnio = (fecha: string) => nombreMes(fecha.slice(0, 7)).replace(" de ", " ");

/** Diferencia con la media de esta semana en otros años, en puntos. */
function frenteMedia(e: Embalse): number | null {
  if (e.porcentaje == null || !e.media) return null;
  return Math.round(e.porcentaje - e.media.porcentaje);
}

/** Diferencia en puntos de porcentaje respecto a otra referencia. */
function Puntos({ actual, referencia, texto }: { actual: number | null; referencia: number | null; texto: string }) {
  if (actual == null || referencia == null) return null;
  const d = Math.round(actual - referencia);
  const clase = d > 0 ? "sube" : d < 0 ? "baja" : "estable";
  return (
    <li>
      <span className="suave">{texto}</span> <b>{n(referencia, 0)} %</b>{" "}
      <span className={`variacion ${clase}`}>{d === 0 ? "igual" : `${d > 0 ? "+" : "−"}${Math.abs(d)} puntos ahora`}</span>
    </li>
  );
}

function Comparativa({ e }: { e: Embalse }) {
  if (e.anioPasado == null && !e.media) return null;
  return (
    <ul className="comparativa-embalse">
      <Puntos actual={e.porcentaje} referencia={e.anioPasado} texto="Hace un año" />
      {e.media && <Puntos actual={e.porcentaje} referencia={e.media.porcentaje} texto={`Media de ${e.media.anios} años`} />}
    </ul>
  );
}

function Variacion({ v }: { v: number | null }) {
  if (v === null) return null;
  const clase = v > 0 ? "sube" : v < 0 ? "baja" : "estable";
  return (
    <span className={`variacion ${clase}`}>
      {v > 0 ? "▲" : v < 0 ? "▼" : "●"} {conSigno(v)} hm³ en 7 días
    </span>
  );
}

/** Minigráfica del último año (porcentaje semanal). */
function Serie({ serie, color }: { serie: Embalse["serie"]; color: string }) {
  const puntos = serie.filter((s): s is [string, number] => s[1] !== null);
  if (puntos.length < 2) return <div className="mini-rio" />;
  const ancho = 300;
  const alto = 46;
  const x = (i: number) => (i / (puntos.length - 1)) * ancho;
  const y = (p: number) => alto - 2 - (Math.min(100, Math.max(0, p)) / 100) * (alto - 4);
  const linea = puntos.map(([, p], i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  return (
    <svg className="mini-rio" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" role="img" aria-label="Evolución del último año">
      <path d={`${linea} L${ancho} ${alto} L0 ${alto} Z`} fill={color} opacity="0.12" />
      <path d={linea} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Texto del dato: semanal del boletín o, si no lo hay, el del SAIH. */
function textoDato(e: Embalse): string {
  if (e.fecha)
    return `Boletín del ${fechaCompleta(e.fecha)}${e.reciente ? ` · ${e.reciente.fuente} a las ${hora(e.reciente.ts)}: ${n(e.reciente.porcentaje)} %` : ""}`;
  if (e.reciente) return `Solo dato del ${e.reciente.fuente} (no sale en el boletín semanal), a las ${hora(e.reciente.ts)}`;
  return "Sin datos ahora mismo";
}

/** Tarjeta de un embalse que sigue el usuario (como las de los ríos). */
function TarjetaEmbalse({ e, seg }: { e: Embalse; seg: Seguidos }) {
  const color = colorEmbalse(e.porcentaje);
  return (
    <a href={`/embalses/${e.slug}`} className="tarjeta tarjeta-rio tarjeta-embalse enlace" style={{ borderTopColor: color }}>
      <div className="tarjeta-rio-cabecera">
        <div>
          <h3>{e.nombre}</h3>
          <p className="suave pequeno">
            {e.rio ? `Río ${e.rio} · ` : ""}
            {e.cuenca}
          </p>
        </div>
        {seg.usuario && <BotonSeguir activo={seg.sigue(e.slug)} ocupado={seg.ocupado === e.slug} onClick={() => seg.alternar(e.slug)} nombre={e.nombre} />}
      </div>
      <p className="numero-medio" style={{ color }}>
        {n(e.porcentaje, 0)}
        <sup>%</sup>
      </p>
      <div className="barra-embalse">
        <i
          style={{
            width: `${Math.min(100, e.porcentaje ?? 0)}%`,
            background: color,
          }}
        />
      </div>
      <p>
        <b>{n(e.volumen, e.volumen != null && e.volumen < 10 ? 1 : 0)} hm³</b> <span className="suave">de {n(e.capacidad, 0)} hm³</span>
      </p>
      <Variacion v={e.variacion} />
      <Comparativa e={e} />
      <Serie serie={e.serie} color={color} />
      <p className="suave pequeno">
        {textoDato(e)}
        {e.maximo &&
          e.minimo &&
          ` · máx. ${n(e.maximo.volumen, 0)} hm³ (${mesAnio(e.maximo.fecha)}), mín. ${n(e.minimo.volumen, 0)} hm³ (${mesAnio(e.minimo.fecha)})`}
      </p>
      <span className="ver-grafica">Ver el embalse ›</span>
    </a>
  );
}

/** Fila compacta de la lista de todos los embalses. */
function FilaEmbalse({ e, seg }: { e: Embalse; seg: Seguidos }) {
  const color = colorEmbalse(e.porcentaje);
  const d = frenteMedia(e);
  return (
    <a href={`/embalses/${e.slug}`} className="fila-rio fila-embalse">
      <i className="punto-rio" style={{ background: color }} aria-hidden="true" />
      <span className="fila-rio-nombre">
        <b>{e.nombre}</b>
        <small className="suave">
          {e.rio ? `Río ${e.rio} · ` : ""}
          {n(e.volumen, e.volumen != null && e.volumen < 10 ? 1 : 0)} de {n(e.capacidad, 0)} hm³
        </small>
      </span>
      <span className="fila-rio-valor">
        <b>{n(e.porcentaje, 0)}</b> <small className="suave">%</small>
      </span>
      <span className="fila-rio-estado">
        {d !== null ? (
          <span
            className={`variacion ${d > 0 ? "sube" : d < 0 ? "baja" : "estable"}`}
            title={`Media de esta semana en ${e.media!.anios} años: ${n(e.media!.porcentaje, 0)} %`}
          >
            {d === 0 ? "como la media" : `${d > 0 ? "+" : "−"}${Math.abs(d)} vs media`}
          </span>
        ) : (
          <small className="suave">{e.fecha ? "" : "solo SAIH"}</small>
        )}
        {e.variacion !== null && (
          <span className={`variacion ${e.variacion > 0 ? "sube" : e.variacion < 0 ? "baja" : "estable"}`} title={`${conSigno(e.variacion)} hm³ en 7 días`}>
            {e.variacion > 0 ? "▲" : e.variacion < 0 ? "▼" : "●"}
          </span>
        )}
      </span>
      {seg.usuario && <BotonSeguir activo={seg.sigue(e.slug)} ocupado={seg.ocupado === e.slug} onClick={() => seg.alternar(e.slug)} nombre={e.nombre} />}
    </a>
  );
}

/** Un grupo de la lista (una cuenca) que se abre y se cierra. */
function GrupoEmbalses({
  titulo,
  lista,
  seg,
  abierto,
  onCambio,
}: {
  titulo: string;
  lista: Embalse[];
  seg: Seguidos;
  abierto: boolean;
  onCambio: (abierto: boolean) => void;
}) {
  const capacidad = lista.reduce((s, e) => s + (e.capacidad ?? 0), 0);
  const volumen = lista.reduce((s, e) => s + (e.volumen ?? 0), 0);
  return (
    <details className="tarjeta lista-rios" open={abierto} onToggle={(ev) => onCambio((ev.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="titulo-grupo">{titulo}</span>
        <span className="suave pequeno">
          {lista.length} {lista.length === 1 ? "embalse" : "embalses"}
          {capacidad > 0 && ` · ${n((volumen / capacidad) * 100, 0)} % en conjunto`}
        </span>
      </summary>
      {lista.map((e) => (
        <FilaEmbalse key={e.slug} e={e} seg={seg} />
      ))}
    </details>
  );
}

export default function Embalses() {
  const { datos, error } = usePeticion<RespuestaEmbalses>("/api/embalses", 30 * 60_000);
  const seg = useSeguidos("embalse", datos?.porDefecto ?? []);
  const admin = useSesion().usuario?.rol === "admin";
  const [busca, setBusca] = useState("");
  const [cuenca, setCuenca] = useState("");
  // Grupos abiertos a mano; al buscar o filtrar por cuenca se abren todos los que tengan resultados
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const embalses = datos?.embalses ?? [];
  const cuencas = useMemo(() => [...new Set(embalses.map((e) => e.cuenca))].sort((a, b) => a.localeCompare(b, "es")), [embalses]);
  const filtrados = useMemo(() => {
    const q = quitarAcentos(busca.trim());
    return embalses.filter((e) => (!cuenca || e.cuenca === cuenca) && (!q || quitarAcentos(`${e.nombre} ${e.rio ?? ""} ${e.provincia}`).includes(q)));
  }, [embalses, busca, cuenca]);
  if (!datos) return <Cargando error={error} />;

  const destacados = seg.destacados.map((slug) => embalses.find((e) => e.slug === slug)).filter((e): e is Embalse => !!e);
  const porCuenca = cuencas.map((c) => [c, filtrados.filter((e) => e.cuenca === c)] as const).filter(([, l]) => l.length);
  const conMapa = filtrados.filter((e) => e.lat !== null && e.lon !== null);

  return (
    <>
      <section className="cabecera-embalses">
        <h1>Embalses</h1>
        <p className="suave">
          Agua embalsada según el boletín semanal del MITECO
          {datos.fecha && ` (el último, del ${fechaCompleta(datos.fecha)})`} y, cuando lo hay, el dato reciente del SAIH. Pulsa un embalse para ver su evolución
          y su histórico.
        </p>
      </section>

      {destacados.length > 0 && (
        <>
          <CabeceraSeccion
            titulo={seg.sonPropios ? "Tus embalses" : "Destacado"}
            nota={
              seg.usuario
                ? seg.sonPropios
                  ? "Los que sigues (☆ para añadir o quitar)"
                  : "Pulsa ☆ en cualquier embalse para tenerlo aquí"
                : "Entra en tu cuenta para elegir los embalses que ves aquí"
            }
          />
          <div className="rejilla-3 rejilla-rios">
            {destacados.map((e) => (
              <TarjetaEmbalse key={e.slug} e={e} seg={seg} />
            ))}
          </div>
        </>
      )}

      <CabeceraSeccion titulo="Todos los embalses" nota={`${embalses.length} ${embalses.length === 1 ? "embalse" : "embalses"}`} />
      {admin && (
        <p className="anadir-admin">
          <a className="boton-secundario" href="/admin#embalses">
            + Añadir embalse
          </a>
          <small className="suave">Solo lo ves tú, como administrador: cualquier embalse de España.</small>
        </p>
      )}
      {embalses.length > 4 && (
        <div className="filtros-rios">
          <input
            type="search"
            value={busca}
            placeholder="Buscar un embalse, un río o un lugar…"
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar un embalse"
          />
          {cuencas.length > 1 && (
            <select value={cuenca} onChange={(e) => setCuenca(e.target.value)} aria-label="Cuenca">
              <option value="">Todas las cuencas</option>
              {cuencas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {conMapa.length > 0 && (
        <Suspense fallback={<div className="mapa" />}>
          <Mapa
            alto={420}
            margen={0.08}
            pequeno
            soloFijos={conMapa.length > 8}
            puntos={conMapa.map((e) => ({
              lat: e.lat!,
              lon: e.lon!,
              nombre: e.nombre,
              valor: null,
              etiqueta: `${n(e.porcentaje, 0)} %`,
              href: `/embalses/${e.slug}`,
              color: colorEmbalse(e.porcentaje),
              fijo: seg.destacados.includes(e.slug),
            }))}
          />
        </Suspense>
      )}
      <p className="leyenda-rios suave pequeno">
        <i style={{ background: "var(--e-muy-bajo)" }} /> Menos del 25 % <i style={{ background: "var(--e-bajo)" }} /> 25–50 %{" "}
        <i style={{ background: "var(--e-medio)" }} /> 50–75 % <i style={{ background: "var(--e-alto)" }} /> Más del 75 %
      </p>

      {porCuenca.length ? (
        porCuenca.map(([c, lista]) => (
          <GrupoEmbalses
            key={c}
            titulo={`Cuenca del ${c}`}
            lista={lista}
            seg={seg}
            abierto={!!busca.trim() || !!cuenca || abiertos.has(c)}
            onCambio={(abierto) =>
              setAbiertos((prev) => {
                const nuevo = new Set(prev);
                if (abierto) nuevo.add(c);
                else nuevo.delete(c);
                return nuevo;
              })
            }
          />
        ))
      ) : (
        <p className="vacio">{embalses.length ? "Ningún embalse coincide con la búsqueda." : "Todavía no hay embalses configurados."}</p>
      )}

      <p className="pie-fuente">
        Datos:{" "}
        <a href="https://mapasdeembalses.es/" target="_blank" rel="noreferrer">
          MapasDeEmbalses.es
        </a>{" "}
        · Fuente:{" "}
        <a href="https://www.miteco.gob.es/es/agua/temas/evaluacion-de-los-recursos-hidricos/boletin-hidrologico.html" target="_blank" rel="noreferrer">
          boletín hidrológico semanal del MITECO
        </a>{" "}
        y SAIH de cada confederación (provisional)
        {datos.errores.length > 0 && ` · No se han podido leer: ${datos.errores.join(", ")}`}
      </p>
    </>
  );
}
