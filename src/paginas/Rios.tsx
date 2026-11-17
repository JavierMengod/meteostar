// Ríos: arriba los que sigue el usuario (sin cuenta, los de por defecto: el Turia); debajo, todos los aforos
// configurados con buscador, filtro por cuenca, mapa y lista. Cada río tiene su página con el detalle.
// Caudal medido del Observatorio del Agua (MITECO).
import { lazy, Suspense, useMemo, useState } from "react";
import type { Aforo, RespuestaAforos } from "../../shared/tipos";
import BotonSeguir from "../componentes/BotonSeguir";
import { Cargando, CabeceraSeccion } from "../componentes/Piezas";
import { usePeticion, useSesion } from "../datos";
import { hace, n } from "../formato";
import { COLOR_SIN_AGUA, COLOR_SIN_DATOS, COLORES_NIVEL, esBarranco, nombreDeRio, situacionAforo, textoTendencia } from "../rios";
import { useSeguidos } from "../seguidos";

const Mapa = lazy(() => import("../componentes/Mapa"));

type Seguidos = ReturnType<typeof useSeguidos>;

/** Valor principal de un aforo: el caudal o, si no lo da, el nivel. */
function valor(a: Aforo): { cifra: string; unidad: string } {
  const u = a.ultimo;
  if (u?.caudal == null && u?.nivel != null && u.nivel < 0) return { cifra: "0", unidad: "m de nivel" };
  if (u?.caudal != null) return { cifra: n(u.caudal, u.caudal < 10 ? 2 : 1), unidad: "m³/s" };
  if (u?.nivel != null) return { cifra: n(u.nivel, 2), unidad: "m de nivel" };
  return { cifra: "—", unidad: "" };
}

/** Minigráfica de las últimas 48 horas. */
function Mini({ serie, color }: { serie: [number, number][]; color: string }) {
  if (serie.length < 2) return <div className="mini-rio" />;
  const ancho = 300;
  const alto = 46;
  const t0 = serie[0][0];
  const t1 = serie.at(-1)![0];
  const valores = serie.map((s) => s[1]);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const margen = Math.max((max - min) * 0.15, max * 0.05, 0.01);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * ancho;
  const y = (v: number) => alto - 2 - ((v - (min - margen)) / (max - min + 2 * margen)) * (alto - 4);
  const linea = serie.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="mini-rio" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" role="img" aria-label="Últimas 48 horas">
      <path d={`${linea} L${ancho} ${alto} L0 ${alto} Z`} fill={color} opacity="0.12" />
      <path d={linea} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TarjetaRio({ a, seg }: { a: Aforo; seg: Seguidos }) {
  const s = situacionAforo(a);
  const t = textoTendencia(a.tendencia);
  const v = valor(a);
  return (
    <a href={`/rios/${a.slug}`} className="tarjeta tarjeta-rio enlace" style={{ borderTopColor: s.color }}>
      <div className="tarjeta-rio-cabecera">
        <div>
          <h3>{a.nombre}</h3>
          <p className="suave pequeno">
            {nombreDeRio(a.rio)}
            {a.confederacion && ` · ${a.confederacion}`}
          </p>
        </div>
        {seg.usuario && <BotonSeguir activo={seg.sigue(a.slug)} ocupado={seg.ocupado === a.slug} onClick={() => seg.alternar(a.slug)} nombre={a.nombre} />}
      </div>
      <p className="numero-medio">
        {v.cifra}
        <sup>{v.unidad}</sup>
      </p>
      <p className="estado-rio">
        {s.pastilla && (
          <span className="pastilla-normal" style={{ background: s.color }}>
            {s.pastilla}
          </span>
        )}
        {s.textoAviso && <span className={`insignia-aviso ${s.aviso >= 0 ? `aviso-${s.aviso + 1}` : ""}`}>{s.textoAviso}</span>}
        {t && (
          <span className={`variacion ${t.clase}`}>
            {t.flecha} {t.clase === "estable" ? "Estable" : t.clase === "sube" ? "Subiendo" : "Bajando"}
          </span>
        )}
      </p>
      <Mini serie={a.mini} color={s.color} />
      <p className="suave pequeno">
        {s.estado === "sin-datos"
          ? "El aforo no está publicando datos ahora mismo"
          : `${s.estado === "antiguo" ? "Sin datos recientes: última lectura" : "Lectura"} ${hace(Math.floor(Date.now() / 1000) - a.ultimo!.t)}`}
        {a.normalHoy && ` · lo normal estos días: ${n(a.normalHoy[2], 2)} m³/s`}
      </p>
      <span className="ver-grafica">Ver el río ›</span>
    </a>
  );
}

/** Fila compacta de la lista de todos los ríos. */
function FilaRio({ a, seg }: { a: Aforo; seg: Seguidos }) {
  const s = situacionAforo(a);
  const t = textoTendencia(a.tendencia);
  const v = valor(a);
  return (
    <a href={`/rios/${a.slug}`} className="fila-rio">
      <i className="punto-rio" style={{ background: s.color }} aria-hidden="true" />
      <span className="fila-rio-nombre">
        <b>{a.nombre}</b>
        <small className="suave">{nombreDeRio(a.rio)}</small>
      </span>
      <span className="fila-rio-valor">
        <b>{v.cifra}</b> <small className="suave">{v.unidad}</small>
      </span>
      <span className="fila-rio-estado">
        {s.aviso >= 0 ? (
          <span className={`insignia-aviso aviso-${s.aviso + 1}`}>{s.textoAviso}</span>
        ) : s.pastilla ? (
          <span className="pastilla-normal" style={{ background: s.color }}>
            {s.estado === "antiguo" ? "Sin datos recientes" : s.pastilla}
          </span>
        ) : null}
        {t && <span className={`variacion ${t.clase}`}>{t.flecha}</span>}
      </span>
      {seg.usuario && <BotonSeguir activo={seg.sigue(a.slug)} ocupado={seg.ocupado === a.slug} onClick={() => seg.alternar(a.slug)} nombre={a.nombre} />}
    </a>
  );
}

/** Barrancos y ramblas van en su propio grupo, aparte de los ríos de cada cuenca. */
const BARRANCOS = "Barrancos y ramblas";

const quitarAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function Rios() {
  const { datos, error } = usePeticion<RespuestaAforos>("/api/aforos", 5 * 60_000);
  const seg = useSeguidos("rio", datos?.porDefecto ?? []);
  const admin = useSesion().usuario?.rol === "admin";
  const [busca, setBusca] = useState("");
  const [cuenca, setCuenca] = useState("");
  const aforos = datos?.aforos ?? [];
  const cuencas = useMemo(() => [...new Set(aforos.map((a) => a.confederacion ?? "Otras"))].sort((a, b) => a.localeCompare(b, "es")), [aforos]);
  const filtrados = useMemo(() => {
    const q = quitarAcentos(busca.trim());
    return aforos.filter((a) => (!cuenca || (a.confederacion ?? "Otras") === cuenca) && (!q || quitarAcentos(`${a.nombre} ${a.rio}`).includes(q)));
  }, [aforos, busca, cuenca]);
  if (!datos) return <Cargando error={error} />;

  const destacados = seg.destacados.map((slug) => aforos.find((a) => a.slug === slug)).filter((a): a is Aforo => !!a);
  const porCuenca = [
    [BARRANCOS, filtrados.filter(esBarranco)] as const,
    ...cuencas.map((c) => [c, filtrados.filter((a) => !esBarranco(a) && (a.confederacion ?? "Otras") === c)] as const),
  ].filter(([, l]) => l.length);

  return (
    <>
      <section className="cabecera-embalses">
        <h1>Ríos</h1>
        <p className="suave">Caudal medido cada 10 minutos en los aforos de las confederaciones hidrográficas. Pulsa un río para ver su evolución, la previsión y su histórico.</p>
      </section>

      {destacados.length > 0 && (
        <>
          <CabeceraSeccion
            titulo={seg.sonPropios ? "Tus ríos" : "Destacado"}
            nota={
              seg.usuario
                ? seg.sonPropios
                  ? "Los que sigues (☆ para añadir o quitar)"
                  : "Pulsa ☆ en cualquier río para tenerlo aquí"
                : "Entra en tu cuenta para elegir los ríos que ves aquí"
            }
          />
          <div className="rejilla-3 rejilla-rios">
            {destacados.map((a) => (
              <TarjetaRio key={a.slug} a={a} seg={seg} />
            ))}
          </div>
        </>
      )}

      <CabeceraSeccion titulo="Todos los ríos" nota={`${aforos.length} ${aforos.length === 1 ? "aforo" : "aforos"}`} />
      {admin && (
        <p className="anadir-admin">
          <a className="boton-secundario" href="/admin#rios">
            + Añadir río
          </a>
          <small className="suave">Solo lo ves tú, como administrador: cualquier aforo de las cuencas del Estado.</small>
        </p>
      )}
      {aforos.length > 4 && (
        <div className="filtros-rios">
          <input type="search" value={busca} placeholder="Buscar un río o un lugar…" onChange={(e) => setBusca(e.target.value)} aria-label="Buscar un río" />
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

      {filtrados.length > 0 && (
        <Suspense fallback={<div className="mapa" />}>
          <Mapa
            alto={400}
            agrupar={filtrados.length > 8}
            puntos={filtrados.map((a) => {
              const v = valor(a);
              return {
                lat: a.lat,
                lon: a.lon,
                nombre: a.nombre,
                valor: null,
                etiqueta: v.unidad === "m³/s" ? `${v.cifra} m³/s` : v.unidad ? `${v.cifra} m` : "—",
                href: `/rios/${a.slug}`,
                color: situacionAforo(a).color,
              };
            })}
          />
        </Suspense>
      )}
      <p className="leyenda-rios suave pequeno">
        <i style={{ background: COLORES_NIVEL[0] }} /> Muy bajo <i style={{ background: COLORES_NIVEL[1] }} /> Bajo <i style={{ background: COLORES_NIVEL[2] }} /> Normal{" "}
        <i style={{ background: COLORES_NIVEL[3] }} /> Alto <i style={{ background: COLORES_NIVEL[4] }} /> Muy alto <i style={{ background: "#e0b400" }} /> Con aviso{" "}
        <i style={{ background: COLOR_SIN_AGUA }} /> Sin agua <i style={{ background: COLOR_SIN_DATOS }} /> Sin datos{" "}
        <i style={{ background: "#6b7280" }} /> Sin histórico para comparar
      </p>

      {porCuenca.length ? (
        porCuenca.map(([c, lista]) => (
          <section key={c} className="tarjeta lista-rios">
            <h3 className="titulo-acento">{c === BARRANCOS ? c : `Cuenca del ${c}`}</h3>
            {lista.map((a) => (
              <FilaRio key={a.slug} a={a} seg={seg} />
            ))}
          </section>
        ))
      ) : (
        <p className="vacio">{aforos.length ? "Ningún río coincide con la búsqueda." : "Todavía no hay ríos configurados."}</p>
      )}

      <p className="nota-fuente seccion">
        Caudal medido por las confederaciones hidrográficas y publicado por el{" "}
        <a href="https://observatorioagua.miteco.es/hidrologia/" target="_blank" rel="noreferrer">
          Observatorio del Agua (MITECO)
        </a>
        , con unos 40–60 minutos de retraso. Datos en tiempo real, provisionales y sin validar. «Lo normal» sale del Anuario de Aforos (1991–2020).
      </p>
    </>
  );
}
