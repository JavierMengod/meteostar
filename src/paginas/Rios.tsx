// Ríos: todos los aforos configurados de un vistazo (tarjetas y mapa). Cada uno tiene su página con el detalle.
// Caudal medido del Observatorio del Agua (MITECO).
import { lazy, Suspense } from "react";
import type { Aforo, RespuestaAforos } from "../../shared/tipos";
import { Cargando, CabeceraSeccion } from "../componentes/Piezas";
import { usePeticion } from "../datos";
import { hace, n } from "../formato";
import { situacionAforo, textoTendencia } from "../rios";

const Mapa = lazy(() => import("../componentes/Mapa"));

/** Minigráfica del caudal de las últimas 48 horas. */
function Mini({ serie, color }: { serie: [number, number][]; color: string }) {
  if (serie.length < 2) return null;
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
    <svg className="mini-rio" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" role="img" aria-label="Caudal de las últimas 48 horas">
      <path d={`${linea} L${ancho} ${alto} L0 ${alto} Z`} fill={color} opacity="0.12" />
      <path d={linea} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TarjetaRio({ a }: { a: Aforo }) {
  const s = situacionAforo(a);
  const t = textoTendencia(a.tendencia);
  const ahora = Math.floor(Date.now() / 1000);
  return (
    <a href={`/rios/${a.slug}`} className="tarjeta tarjeta-rio enlace" style={{ borderTopColor: s.color }}>
      <div className="tarjeta-rio-cabecera">
        <div>
          <h3>{a.nombre}</h3>
          <p className="suave pequeno">
            Río {a.rio}
            {a.confederacion && ` · ${a.confederacion}`}
          </p>
        </div>
        {s.textoAviso && <span className={`insignia-aviso ${s.aviso >= 0 ? `aviso-${s.aviso + 1}` : ""}`}>{s.textoAviso}</span>}
      </div>
      <p className="numero-medio">
        {s.caudal === null ? "—" : n(s.caudal, 2)}
        <sup>m³/s</sup>
      </p>
      <p className="estado-rio">
        {s.normal && (
          <span className="pastilla-normal" style={{ background: s.color }}>
            {s.normal.corto}
          </span>
        )}
        {t && (
          <span className={`variacion ${t.clase}`}>
            {t.flecha} {t.clase === "estable" ? "Estable" : t.clase === "sube" ? "Subiendo" : "Bajando"}
          </span>
        )}
      </p>
      <Mini serie={a.mini} color={s.color} />
      <p className="suave pequeno">
        {a.ultimo ? `Lectura ${hace(ahora - a.ultimo.t)}` : "Sin lecturas recientes"}
        {a.normalHoy && ` · lo normal estos días: ${n(a.normalHoy[2], 2)} m³/s`}
      </p>
      <span className="ver-grafica">Ver el río ›</span>
    </a>
  );
}

export default function Rios() {
  const { datos, error } = usePeticion<RespuestaAforos>("/api/aforos", 5 * 60_000);
  if (!datos) return <Cargando error={error} />;
  const { aforos } = datos;

  return (
    <>
      <section className="cabecera-embalses">
        <h1>Ríos</h1>
        <p className="suave">Caudal medido cada 10 minutos en los aforos de la zona. Pulsa un río para ver su evolución, la previsión y su histórico.</p>
      </section>

      {aforos.length ? (
        <div className="rejilla-3 rejilla-rios">
          {aforos.map((a) => (
            <TarjetaRio key={a.slug} a={a} />
          ))}
        </div>
      ) : (
        <p className="vacio">Todavía no hay ríos configurados.</p>
      )}

      {aforos.length > 0 && (
        <>
          <CabeceraSeccion titulo="Mapa de los ríos" nota="El color indica cómo va cada río frente a lo normal" />
          <Suspense fallback={<div className="mapa" />}>
            <Mapa
              alto={420}
              puntos={aforos.map((a) => {
                const s = situacionAforo(a);
                return {
                  lat: a.lat,
                  lon: a.lon,
                  nombre: a.nombre,
                  valor: null,
                  etiqueta: s.caudal === null ? "—" : `${n(s.caudal, s.caudal < 10 ? 2 : 1)} m³/s`,
                  href: `/rios/${a.slug}`,
                  color: s.color,
                };
              })}
            />
          </Suspense>
          <p className="leyenda-rios suave pequeno">
            <i style={{ background: "#d4502c" }} /> Muy bajo <i style={{ background: "#d08a10" }} /> Bajo <i style={{ background: "#2b82d9" }} /> Normal{" "}
            <i style={{ background: "#1f5fbf" }} /> Alto <i style={{ background: "#6a3fc4" }} /> Muy alto <i style={{ background: "#e0b400" }} /> Con aviso
          </p>
        </>
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
