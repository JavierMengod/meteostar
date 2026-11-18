// Portada: la red de estaciones (como una red local de aficionados, con las oficiales aparte).
import { lazy, Suspense } from "react";
import type { RespuestaPrevision, RespuestaRed, SeriesRed } from "../../shared/tipos";
import { puntoCardinal } from "../../shared/meteo";
import { GraficaRed, Panel } from "../componentes/Graficas";
import Icono from "../componentes/Icono";
import { faseDelDia } from "../componentes/Paisaje";
import { CabeceraSeccion, Cargando, Hero } from "../componentes/Piezas";
import TarjetaEstacion from "../componentes/TarjetaEstacion";
import { usePeticion } from "../datos";
import { enDirecto as estaEnDirecto } from "../estaciones";
import { capital, diaSemana, fechaCorta, hora, n } from "../formato";
import { descripcion, textoDia } from "../prevision";

const Mapa = lazy(() => import("../componentes/Mapa"));

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const maximo = (v: number[]) => (v.length ? Math.max(...v) : null);

export default function Red({ red, prevision }: { red: RespuestaRed | null; prevision: RespuestaPrevision | null }) {
  const { datos: series } = usePeticion<SeriesRed>("/api/red/temperaturas?horas=24", 5 * 60_000);
  if (!red) return <Cargando />;
  const { ahora } = red;
  const particulares = red.estaciones.filter((d) => d.estacion.tipo === "particular");
  const oficiales = red.estaciones.filter((d) => d.estacion.tipo === "oficial");
  const externas = red.estaciones.filter((d) => d.estacion.tipo === "externa");
  const enDirecto = red.estaciones.filter((d) => estaEnDirecto(d, ahora));
  // Las medias de la cabecera, solo con las estaciones de la red (las oficiales son horarias y van aparte)
  const deLaRed = enDirecto.filter((d) => d.estacion.tipo === "particular");
  const valores = (f: (d: (typeof enDirecto)[number]) => number | null | undefined) =>
    deLaRed.map(f).filter((v): v is number => v !== null && v !== undefined);
  const fase = faseDelDia(ahora, prevision?.dias[0]?.salida, prevision?.dias[0]?.puesta);
  // Misma escala de temperatura en todas las tarjetas, para poder compararlas
  const extremosHoy = red.estaciones.flatMap((d) => [d.hoy?.tmin, d.hoy?.tmax, d.actual?.temp]).filter((v): v is number => typeof v === "number");
  const escala: [number, number] | undefined = extremosHoy.length ? [Math.min(...extremosHoy) - 2, Math.max(...extremosHoy) + 2] : undefined;
  const nombres = Object.fromEntries(red.estaciones.map((d) => [d.estacion.slug, d.estacion.nombre]));

  return (
    <>
      <Hero
        fase={fase}
        titulo={red.red.titulo}
        subtitulo={red.red.subtitulo}
        pie={
          <>
            <div className="franja">
              <div>
                <small>Temp. media</small>
                <b>
                  {n(media(valores((d) => d.actual?.temp)))}
                  <span>°C</span>
                </b>
              </div>
              <div>
                <small>Racha máx. hoy</small>
                <b>
                  {n(maximo(valores((d) => d.hoy?.racha_max)), 0)}
                  <span>km/h</span>
                </b>
              </div>
              <div>
                <small>Lluvia máx. hoy</small>
                <b>
                  {n(maximo(valores((d) => d.actual?.lluvia_dia)))}
                  <span>mm</span>
                </b>
              </div>
              <div>
                <small>Presión</small>
                <b>
                  {n(media(valores((d) => d.actual?.presion)))}
                  <span>hPa</span>
                </b>
              </div>
            </div>
            <span className="franja-directo">
              {enDirecto.length} {enDirecto.length === 1 ? "estación" : "estaciones"} en directo · <span className="mono">{hora(ahora)}</span>
            </span>
          </>
        }
      />

      {particulares.length > 0 && (
        <>
          <CabeceraSeccion titulo="Estaciones" nota="Pulsa una estación para ver todos sus datos" />
          <div className="rejilla-3">
            {particulares.map((d) => (
              <TarjetaEstacion key={d.estacion.id} d={d} escala={escala} />
            ))}
          </div>
        </>
      )}

      {externas.length > 0 && (
        <>
          <CabeceraSeccion titulo={particulares.length ? "Otras redes" : "Estaciones"} nota={<a href="/estaciones">Ver todas las estaciones de la zona ›</a>} />
          <div className="rejilla-3">
            {externas.map((d) => (
              <TarjetaEstacion key={d.estacion.id} d={d} escala={escala} />
            ))}
          </div>
        </>
      )}
      {!particulares.length && !externas.length && <p className="vacio">Todavía no hay estaciones. <a href="/estaciones">Ver las de la zona ›</a></p>}

      {oficiales.length > 0 && (
        <>
          <CabeceraSeccion titulo="Estaciones oficiales" nota="Redes públicas de la zona" />
          <div className="rejilla-3">
            {oficiales.map((d) => (
              <TarjetaEstacion key={d.estacion.id} d={d} escala={escala} />
            ))}
          </div>
        </>
      )}

      <CabeceraSeccion titulo="Mapa de estaciones" nota="Pulsa una estación para ver todos sus datos" />
      <Suspense fallback={<div className="mapa" />}>
        <Mapa
          puntos={red.estaciones.map((d) => ({
            lat: d.estacion.lat,
            lon: d.estacion.lon,
            nombre: d.estacion.nombre,
            valor: estaEnDirecto(d, ahora) ? (d.actual?.temp ?? null) : null,
            href: `/estacion/${d.estacion.slug}`,
            oficial: d.estacion.tipo === "oficial",
          }))}
        />
      </Suspense>

      {series && (
        <div className="seccion">
          <Panel titulo="Temperatura en las últimas 24 horas" nota="Comparativa de la red">
            <GraficaRed series={series} nombres={nombres} />
          </Panel>
        </div>
      )}

      {prevision && prevision.dias.length > 1 && <BloquePrevision lugar={red.red.lugar} prevision={prevision} />}

      <div className="rejilla-3 seccion">
        <Acceso
          href="/prevision"
          titulo="Previsión"
          texto={`La previsión de ${red.red.lugar}, de las estaciones y de tus lugares, hora a hora y a 14 días`}
          icono="reloj"
          enlaces={[
            ["/prevision", "Por horas"],
            ["/prevision/14-dias", "14 días"],
          ]}
        />
        <Acceso
          href="/radar"
          titulo="Seguimiento"
          texto="Radar y satélite en directo, para ver por dónde viene la lluvia y cómo se mueven las nubes"
          icono="radar"
          enlaces={[
            ["/radar", "Radar"],
            ["/satelite", "Satélite"],
          ]}
        />
        <Acceso
          href="/rios"
          titulo="Hidrología"
          texto="El caudal del Turia en Villastar con su previsión, y cuánta agua guardan los embalses de Teruel y del Turia"
          icono="agua"
          enlaces={[
            ["/rios", "Ríos"],
            ["/embalses", "Embalses"],
          ]}
        />
      </div>
    </>
  );
}

export function BloquePrevision({ lugar, prevision, mas = true }: { lugar: string; prevision: RespuestaPrevision; mas?: boolean }) {
  const manana = prevision.dias[1];
  return (
    <>
      <CabeceraSeccion titulo={`Previsión · ${lugar}`} />
      <p className="nota-fuente">
        Datos:{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        (CC BY 4.0) · actualizada a las {hora(prevision.generado)}
      </p>
      <div className="tarjeta resumen-prevision">
        <Icono codigo={manana.codigo} size={64} />
        <div>
          <h3>
            Mañana, {diaSemana(manana.fecha)} {fechaCorta(manana.fecha)}
          </h3>
          <p>{textoDia(manana, prevision.horas)}</p>
        </div>
      </div>
      <div className="dias-5 tarjeta">
        {prevision.dias.slice(0, 5).map((d, i) => (
          <div key={d.fecha} className="dia-5">
            <b>{i === 0 ? "Hoy" : i === 1 ? "Mañana" : capital(diaSemana(d.fecha))}</b>
            <small>{fechaCorta(d.fecha)}</small>
            <Icono codigo={d.codigo} size={48} />
            <span className="dia-desc">{descripcion(d.codigo)}</span>
            <span className="dia-temps">
              <b className="frio">{Math.round(d.tmin)}°</b> / <b className="calor">{Math.round(d.tmax)}°</b>
            </span>
            <span className="dia-prob">Prob. de lluvia {d.prob} %</span>
            <span className="dia-lluvia">{d.lluvia >= 0.1 ? `💧 ${n(d.lluvia)} mm` : "0 mm"}</span>
            <small>
              {puntoCardinal(d.dir)} {d.viento} km/h · rachas {d.racha}
            </small>
          </div>
        ))}
      </div>
      {mas && (
        <p className="ver-mas">
          <a href="/prevision/14-dias">Ver los 14 días ›</a>
        </p>
      )}
    </>
  );
}

function Acceso({
  href,
  titulo,
  texto,
  icono,
  enlaces,
}: {
  href: string;
  titulo: string;
  texto: string;
  icono: "reloj" | "radar" | "agua";
  enlaces: [string, string][];
}) {
  return (
    <div className="tarjeta acceso">
      <a href={href} className="acceso-cabecera">
        <span className="acceso-icono">
          {icono === "agua" ? (
            <svg viewBox="0 0 24 24">
              <path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" />
              <path d="M9 15a3 3 0 0 0 3 3" />
            </svg>
          ) : icono === "radar" ? (
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="4" />
              <path d="M12 12l5-5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 7v5l3 2" />
            </svg>
          )}
        </span>
        <span>
          <h3>{titulo}</h3>
          <p>{texto}</p>
        </span>
        <span className="acceso-flecha">›</span>
      </a>
      <div className="pastillas">
        {enlaces.map(([h, t]) => (
          <a key={t} href={h} className="pastilla">
            {t}
          </a>
        ))}
      </div>
    </div>
  );
}
