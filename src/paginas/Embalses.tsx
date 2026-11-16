// Embalses: reserva total y una tarjeta por embalse (boletín semanal del MITECO y dato reciente del SAIH).
import { lazy, Suspense } from "react";
import type { Embalse, RespuestaEmbalses } from "../../shared/tipos";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import { usePeticion } from "../datos";
import { colorEmbalse } from "../embalses";
import { conSigno, fechaCompleta, hora, n, nombreMes } from "../formato";

const Mapa = lazy(() => import("../componentes/Mapa"));


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
  if (puntos.length < 2) return null;
  const ancho = 300;
  const alto = 44;
  const x = (i: number) => (i / (puntos.length - 1)) * ancho;
  const y = (p: number) => alto - 2 - (Math.min(100, Math.max(0, p)) / 100) * (alto - 4);
  const linea = puntos.map(([, p], i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  return (
    <svg className="serie-embalse" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" role="img" aria-label="Evolución del último año">
      <path d={`${linea} L${ancho} ${alto} L0 ${alto} Z`} fill={color} opacity="0.12" />
      <path d={linea} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const mesAnio = (fecha: string) => nombreMes(fecha.slice(0, 7)).replace(" de ", " ");

function TarjetaEmbalse({ e }: { e: Embalse }) {
  const color = colorEmbalse(e.porcentaje);
  return (
    <a href={`/embalses/${e.slug}`} className="tarjeta tarjeta-embalse enlace">
      <h3>{e.nombre}</h3>
      <p className="suave pequeno">
        {e.rio ? `Río ${e.rio} · ` : ""}
        {e.provincia}
      </p>
      <p className="numero-medio" style={{ color }}>
        {n(e.porcentaje)}
        <sup>%</sup>
      </p>
      <div className="barra-embalse">
        <i style={{ width: `${Math.min(100, e.porcentaje ?? 0)}%`, background: color }} />
      </div>
      <p>
        <b>{n(e.volumen, 0)} hm³</b> <span className="suave">de {n(e.capacidad, 0)} hm³</span>
      </p>
      <Variacion v={e.variacion} />
      <Serie serie={e.serie} color={color} />
      {e.maximo && e.minimo && (
        <p className="suave pequeno">
          Máx. <b>{n(e.maximo.volumen, 0)} hm³</b> ({mesAnio(e.maximo.fecha)}) · Mín. <b>{n(e.minimo.volumen, 0)} hm³</b> (
          {mesAnio(e.minimo.fecha)}){e.desde && ` · desde ${e.desde.slice(0, 4)}`}
        </p>
      )}
      {e.reciente && (
        <p className="reciente-embalse">
          <span className="mono">{e.reciente.fuente}</span> · {hora(e.reciente.ts)}: <b>{n(e.reciente.volumen)} hm³</b>
          {e.reciente.porcentaje !== null && ` (${n(e.reciente.porcentaje)} %)`}
          {e.reciente.nivel !== null && ` · cota ${n(e.reciente.nivel, 2)} m`}
        </p>
      )}
      <span className="ver-grafica">Ver gráfica y datos ›</span>
    </a>
  );
}

export default function Embalses() {
  const { datos, error } = usePeticion<RespuestaEmbalses>("/api/embalses", 30 * 60_000);
  if (!datos) return <Cargando error={error} />;
  const cuencas = [...new Set(datos.embalses.map((e) => e.cuenca))];
  const t = datos.total;

  return (
    <>
      <section className="tarjeta resumen-embalses">
        <div>
          <h1>Embalses</h1>
          <p className="suave">
            Teruel y la cuenca del Turia · boletín semanal del MITECO
            {datos.fecha && ` del ${fechaCompleta(datos.fecha)}`}
          </p>
        </div>
        {t && (
          <div className="reserva-total">
            <small className="mono">RESERVA TOTAL DE LOS EMBALSES</small>
            <b style={{ color: colorEmbalse(t.porcentaje) }}>
              {n(t.porcentaje)}
              <span>%</span>
            </b>
            <p>
              {n(t.volumen, 0)} de {n(t.capacidad, 0)} hm³ <Variacion v={t.variacion} />
            </p>
          </div>
        )}
      </section>

      {cuencas.map((c) => (
        <div key={c}>
          <CabeceraSeccion titulo={`Cuenca del ${c}`} nota="Volumen almacenado y porcentaje de su capacidad" />
          <div className="rejilla-3">
            {datos.embalses
              .filter((e) => e.cuenca === c)
              .map((e) => (
                <TarjetaEmbalse key={e.slug} e={e} />
              ))}
          </div>
        </div>
      ))}

      {datos.embalses.some((e) => e.lat !== null) && (
        <>
          <CabeceraSeccion titulo="Mapa de embalses" />
          <Suspense fallback={<div className="mapa" />}>
            <Mapa
              puntos={datos.embalses
                .filter((e) => e.lat !== null && e.lon !== null)
                .map((e) => ({ lat: e.lat!, lon: e.lon!, nombre: e.nombre, valor: null, etiqueta: `${n(e.porcentaje, 0)} %`, href: `/embalses/${e.slug}`, color: colorEmbalse(e.porcentaje) }))}
            />
          </Suspense>
        </>
      )}

      <p className="nota-fuente seccion">
        Datos procesados por{" "}
        <a href="https://mapasdeembalses.es/" target="_blank" rel="noreferrer">
          MapasDeEmbalses.es
        </a>{" "}
        · Fuente original:{" "}
        <a href="https://www.miteco.gob.es/es/agua/temas/evaluacion-de-los-recursos-hidricos/boletin-hidrologico.html" target="_blank" rel="noreferrer">
          MITECO (boletín hidrológico semanal)
        </a>{" "}
        y, en el dato reciente, el SAIH de cada confederación (datos provisionales, no contrastados).
        {datos.errores.length > 0 && ` No se han podido leer: ${datos.errores.join(", ")}.`}
      </p>
    </>
  );
}
