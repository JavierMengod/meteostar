import { useEffect, useMemo, useState } from "react";
import type { Estacion as InfoEstacion, Extremo, Extremos, PuntoHistorico, RespuestaDatos, RespuestaEstacion, RespuestaPrevision, ResumenDiario } from "../../shared/tipos";
import { puntoCardinal } from "../../shared/meteo";
import {
  crearMarco,
  GraficaDireccion,
  GraficaLluvia,
  GraficaPresion,
  GraficaRayos,
  GraficaSol,
  GraficaTempHum,
  GraficaViento,
  MiniTemp,
  Panel,
} from "../componentes/Graficas";
import {
  mediaTemp,
  DiariaHumedad,
  DiariaLluvia,
  DiariaPresion,
  DiariaRayos,
  DiariaSol,
  DiariaTemp,
  DiariaViento,
  prepararDias,
  TablaMeses,
} from "../componentes/GraficasDiarias";
import { faseDelDia } from "../componentes/Paisaje";
import { BarraMinMax, CabeceraSeccion, Cargando, Hero, Tendencia } from "../componentes/Piezas";
import RosaViento, { CLASES_VIENTO } from "../componentes/RosaViento";
import { usePeticion } from "../datos";
import { beaufort, capital, conSigno, fechaCompleta, fechaCorta, fechaDe, hora, n, nivelUv, nombreMes, soloMes, sumarDias } from "../formato";

const PERIODOS = [
  { horas: 24, nombre: "24 h" },
  { horas: 48, nombre: "48 h" },
  { horas: 72, nombre: "3 días" },
  { horas: 192, nombre: "8 días" },
];

/** Periodos de «Día a día» (días; 0 = todo) */
const PERIODOS_DIAS = [
  { dias: 30, nombre: "30 días" },
  { dias: 92, nombre: "3 meses" },
  { dias: 365, nombre: "Año" },
  { dias: 0, nombre: "Todo" },
];

/** Resumen de las lecturas de un periodo: medias, extremos con su hora, lluvia total… */
function resumenPeriodo(datos: PuntoHistorico[]) {
  const valores = (k: keyof PuntoHistorico) => datos.filter((p) => p[k] !== null && p[k] !== undefined) as (PuntoHistorico & Record<string, number>)[];
  const extremo = (k: keyof PuntoHistorico, max: boolean) => {
    const l = valores(k);
    return l.length ? l.reduce((a, b) => ((max ? (b[k] as number) > (a[k] as number) : (b[k] as number) < (a[k] as number)) ? b : a)) : null;
  };
  const media = (k: keyof PuntoHistorico) => {
    const l = valores(k);
    return l.length ? l.reduce((s2, p) => s2 + (p[k] as number), 0) / l.length : null;
  };
  // Lluvia y rayos: contadores del día que vuelven a cero a medianoche (se suman las subidas)
  const subidas = (k: "lluvia_dia" | "rayos") => {
    let total = 0;
    let antes: number | null = null;
    for (const p of datos) {
      const v = p[k];
      if (v === null || v === undefined) continue;
      if (antes !== null) total += v >= antes ? v - antes : v;
      antes = v;
    }
    return total;
  };
  const pres = valores("presion");
  return {
    tMedia: media("temp"),
    tMax: extremo("temp", true),
    tMin: extremo("temp", false),
    humMedia: media("hum"),
    lluvia: subidas("lluvia_dia"),
    racha: extremo("racha", true),
    presion: pres.length > 1 ? (pres[pres.length - 1].presion as number) - (pres[0].presion as number) : null,
    rayos: datos.some((p) => p.rayos !== null && p.rayos !== undefined) ? subidas("rayos") : null,
  };
}

function FranjaPeriodo({ datos }: { datos: PuntoHistorico[] }) {
  const r = resumenPeriodo(datos);
  const cuando = (t: number) => `${diaCorto(t)} ${hora(t)}`;
  return (
    <div className="tarjeta franja-periodo">
      <div>
        <small>Temp. media</small>
        <b>{n(r.tMedia)}°</b>
      </div>
      <div>
        <small>Máxima</small>
        <b className="calor">{n(r.tMax?.temp)}°</b>
        <span className="mono">{r.tMax ? cuando(r.tMax.t) : ""}</span>
      </div>
      <div>
        <small>Mínima</small>
        <b className="frio">{n(r.tMin?.temp)}°</b>
        <span className="mono">{r.tMin ? cuando(r.tMin.t) : ""}</span>
      </div>
      <div>
        <small>Humedad media</small>
        <b>{n(r.humMedia, 0)} %</b>
      </div>
      <div>
        <small>Lluvia</small>
        <b className="lluvia">{n(r.lluvia)} mm</b>
      </div>
      <div>
        <small>Racha máx.</small>
        <b>{n(r.racha?.racha, 0)} km/h</b>
        <span className="mono">{r.racha ? cuando(r.racha.t) : ""}</span>
      </div>
      <div>
        <small>Presión</small>
        <b>{r.presion === null ? "—" : `${conSigno(r.presion)} hPa`}</b>
        <span className="mono">en el periodo</span>
      </div>
      {r.rayos !== null && (
        <div>
          <small>Rayos</small>
          <b>{r.rayos}</b>
        </div>
      )}
    </div>
  );
}

const fmtDiaCorto = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric" });
const diaCorto = (t: number) => fmtDiaCorto.format(t * 1000);

/** Nombre de cada fuente de datos para la ficha. */
const FUENTES: Record<string, string> = {
  directo: "Envío directo desde la consola",
  push: "Envío directo desde la consola",
  ecowitt_api: "ecowitt.net",
  ecowitt_historico: "ecowitt.net (histórico)",
  api: "ecowitt.net",
  wunderground: "Weather Underground",
  meteoclimatic: "Meteoclimatic",
  aemet: "AEMET OpenData",
};

interface Props {
  slug: string;
  prevision: RespuestaPrevision | null;
}

export default function Estacion({ slug, prevision }: Props) {
  const base = `/api/estaciones/${encodeURIComponent(slug)}`;
  const { datos: info, error: errorInfo } = usePeticion<RespuestaDatos>(`${base}/datos`, 0);
  const { datos: e, error } = usePeticion<RespuestaEstacion>(`${base}/completo`);
  const [horas, setHoras] = useState(24);
  const { datos: lecturas } = usePeticion<PuntoHistorico[]>(`${base}/historico?horas=${horas === 24 ? 48 : horas}`);
  const [periodoDias, setPeriodoDias] = useState(92);
  const { datos: todosDias } = usePeticion<ResumenDiario[]>(`${base}/resumen?dias=todo`);
  // Día de «Consultar un día» (también se elige pulsando un día en las gráficas diarias)
  const [diaConsulta, setDiaConsulta] = useState<string | null>(null);
  const corte = e ? e.ahora - horas * 3600 : 0;
  const historico = useMemo(() => lecturas?.filter((p) => p.t >= corte) ?? null, [lecturas, corte]);
  const ayer = useMemo(() => (horas === 24 ? (lecturas?.filter((p) => p.t < corte) ?? []) : undefined), [lecturas, corte, horas]);
  const diasGrafica = useMemo(() => {
    if (!todosDias || !e) return [];
    const desde = periodoDias ? sumarDias(fechaDe(e.ahora), -(periodoDias - 1)) : "";
    return prepararDias(todosDias.filter((d) => d.fecha >= desde));
  }, [todosDias, periodoDias, e]);
  const { datos: h24 } = usePeticion<PuntoHistorico[]>(`${base}/historico?horas=24`);

  if (errorInfo === "no encontrado") return <p className="vacio">Esta estación no existe. <a href="/">Volver a la portada</a></p>;
  if (!e || !info) return <Cargando error={error} />;
  const estacion = info.estacion;
  const a = e.actual;
  const dia0 = prevision?.dias[0];
  const fase = faseDelDia(e.ahora, dia0?.salida, dia0?.puesta);
  const bf = beaufort(a?.viento ?? null);
  const presionTendencia = a?.presion != null && e.hace3h?.presion != null ? a.presion - e.hace3h.presion : null;
  const t24 = h24?.map((p) => p.temp).filter((v): v is number => v !== null) ?? [];

  return (
    <>
      <Hero
        fase={fase}
        compacto
        alineacion="derecha"
        antetitulo={
          <span className="mono">
            {estacion.tipo !== "particular" ? `${(estacion.red ?? "OFICIAL").toUpperCase()} · ` : ""}
            {estacion.municipio.toUpperCase()} · {estacion.altitud} M DE ALTITUD
          </span>
        }
        titulo={estacion.nombre}
        pie={
          <span className="hero-actualizado">
            <i /> Actualizado a las <span className="mono">{a ? hora(a.ts) : "—"}</span>
            {a && a.fuente !== estacion.fuente && a.fuente !== "push" && ` · vía ${FUENTES[a.fuente] ?? a.fuente}`}
          </span>
        }
      />

      {!a ? (
        <p className="vacio">Todavía no hay datos de la estación.</p>
      ) : (
        <>
          <div className="rejilla-estacion">
            {/* Temperatura */}
            <section className="tarjeta area-temp">
              <div className="t-cabecera">
                <h3>Temperatura</h3>
                <Tendencia actual={a.temp} antes={e.hace1h?.temp ?? null} unidad="°" sufijo="en la última hora" />
              </div>
              <p className="numero-enorme">
                {n(a.temp)}
                <sup>°C</sup>
              </p>
              <p className="suave">
                Sensación térmica <b>{n(a.sensacion)} °C</b> · Rocío <b>{n(a.rocio)} °C</b>
              </p>
              <h4>Hoy</h4>
              <BarraMinMax min={e.hoy?.tmin ?? null} max={e.hoy?.tmax ?? null} actual={a.temp} />
              <div className="te-minmax">
                <span>
                  Mín. <b className="frio">{n(e.hoy?.tmin)}°</b> <small className="mono">{hora(e.hoy?.tmin_ts)}</small>
                </span>
                <span>
                  Máx. <b className="calor">{n(e.hoy?.tmax)}°</b> <small className="mono">{hora(e.hoy?.tmax_ts)}</small>
                </span>
              </div>
              <dl className="lista-datos">
                <div>
                  <dt>Ayer a esta hora</dt>
                  <dd>
                    {n(e.hace24h?.temp)} °C{" "}
                    {e.hace24h?.temp != null && a.temp !== null && (
                      <small className={a.temp - e.hace24h.temp >= 0 ? "calor" : "frio"}>{conSigno(a.temp - e.hace24h.temp)}°</small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Ayer</dt>
                  <dd>
                    <span className="calor">{n(e.ayer?.tmax)}°</span> / <span className="frio">{n(e.ayer?.tmin)}°</span>
                  </dd>
                </div>
              </dl>
              {h24 && h24.length > 1 && (
                <div className="mini">
                  <div className="mini-titulo mono">
                    <span>ÚLTIMAS 24 HORAS</span>
                    <span>
                      {n(Math.min(...t24))}° – {n(Math.max(...t24))}°
                    </span>
                  </div>
                  <MiniTemp datos={h24} />
                </div>
              )}
            </section>

            {/* Humedad */}
            <section className="tarjeta area-hum">
              <h3>Humedad</h3>
              <p className="numero-medio">
                {n(a.hum, 0)}
                <sup>%</sup>
              </p>
              <p className="extremo-linea">
                <span className="calor">▲ {n(e.hoy?.hum_max, 0)} %</span>
                <span className="frio">▼ {n(e.hoy?.hum_min, 0)} %</span>
              </p>
            </section>

            {/* Presión */}
            <section className="tarjeta area-pres">
              <h3>Presión</h3>
              <p className="numero-medio">
                {n(a.presion)}
                <sup>hPa</sup>
              </p>
              {presionTendencia !== null && (
                <p className={presionTendencia > 0.5 ? "calor" : presionTendencia < -0.5 ? "frio" : "suave"}>
                  {presionTendencia > 0.5 ? "▲ Subiendo" : presionTendencia < -0.5 ? "▼ Bajando" : "= Estable"} · {conSigno(presionTendencia)} en 3 h
                </p>
              )}
              <p className="extremo-linea">
                <span>▲ {n(e.hoy?.presion_max)}</span>
                <span>▼ {n(e.hoy?.presion_min)}</span>
              </p>
            </section>

            {/* Viento */}
            <section className="tarjeta area-viento">
              <h3>Viento · última hora</h3>
              <RosaViento minutos={e.vientoUltimaHora} actual={a.viento} dir={a.dir} />
              <div className="leyenda-viento">
                <span className="mono">km/h</span>
                {CLASES_VIENTO.map((c) => (
                  <span key={c.nombre}>
                    <i style={{ background: c.color }} />
                    {c.nombre}
                  </span>
                ))}
              </div>
              <p className="centrado">
                Del <b>{puntoCardinal(a.dir)}</b> ({n(a.dir, 0)}°) · <span className="acento">{bf.nombre}</span>
              </p>
              <div className="escala-beaufort" title={`Fuerza ${bf.fuerza} en la escala de Beaufort`}>
                {Array.from({ length: 13 }, (_, i) => (
                  <i key={i} className={i === bf.fuerza ? "activa" : i < bf.fuerza ? "pasada" : ""} />
                ))}
              </div>
              <p className="mono pequeno centrado">Escala de Beaufort · fuerza {bf.fuerza}</p>
              <div className="cajitas">
                <div>
                  <small>Racha ahora</small>
                  <b>{n(a.racha, 0)} km/h</b>
                </div>
                <div>
                  <small>Racha máx.</small>
                  <b>{n(e.hoy?.racha_max, 0)} km/h</b>
                  <small className="mono">{hora(e.hoy?.racha_max_ts)}</small>
                </div>
                <div>
                  <small>Media hoy</small>
                  <b>{n(e.vientoMediaHoy)} km/h</b>
                </div>
              </div>
            </section>

            {/* Precipitación */}
            <section className="tarjeta area-lluvia">
              <h3>Precipitación hoy</h3>
              <div className="lluvia-cuerpo">
                <Pluviometro mm={a.lluvia_dia ?? 0} />
                <div>
                  <p className="numero-medio">
                    {n(a.lluvia_dia)}
                    <sup>mm</sup>
                  </p>
                  <p className="suave">
                    Intensidad ahora <b>{n(a.intensidad)} mm/h</b>
                  </p>
                  <p className="suave">
                    Intensidad máx. <b>{n(e.hoy?.intensidad_max)} mm/h</b>
                  </p>
                </div>
              </div>
              <div className="acumulados">
                <Dato e="Última hora" v={e.lluvia.ultimaHora} />
                <Dato e="24 horas" v={e.lluvia.h24} />
                <Dato e="7 días" v={e.lluvia.d7} />
                <Dato e={capital(soloMes(fechaDe(e.ahora).slice(0, 7)))} v={e.lluvia.mes} />
                <Dato e={`Año ${fechaDe(e.ahora).slice(0, 4)}`} v={e.lluvia.anio} />
              </div>
            </section>

            {/* Radiación */}
            <section className="tarjeta area-sol">
              <h3>Radiación solar</h3>
              <p className="numero-medio">
                {n(a.radiacion, 0)}
                <sup>W/m²</sup>
              </p>
              <p className="suave">
                Máx. hoy <b>{n(e.hoy?.radiacion_max, 0)} W/m²</b>
              </p>
            </section>

            {/* UV */}
            <section className="tarjeta area-uv">
              <h3>Índice UV</h3>
              <p className="numero-medio">{n(a.uv, 0)}</p>
              <div className="escala-uv">
                {[1, 3, 6, 8, 11].map((l, i) => (
                  <i key={l} className={`uv${i} ${(a.uv ?? 0) >= l - 1 ? "on" : ""}`} />
                ))}
              </div>
              <p className="suave">
                Riesgo <b>{nivelUv(a.uv)}</b> · máx. hoy {n(e.hoy?.uv_max, 0)}
              </p>
            </section>
          </div>

          <div className="rejilla-3 seccion">
            <section className="tarjeta">
              <h3>Interior · consola</h3>
              <p className="numero-medio">
                {n(a.temp_int)}
                <sup>°C</sup>
              </p>
              <p className="suave">
                Humedad interior <b>{n(a.hum_int, 0)} %</b>
              </p>
            </section>
            <section className="tarjeta">
              <h3>Sol</h3>
              {dia0 ? (
                <>
                  <p className="numero-medio mono">
                    {hora(dia0.salida)} <span className="suave">–</span> {hora(dia0.puesta)}
                  </p>
                  <p className="suave">
                    Salida y puesta del sol · {Math.floor((dia0.puesta - dia0.salida) / 3600)} h{" "}
                    {Math.round(((dia0.puesta - dia0.salida) % 3600) / 60)} min de día
                  </p>
                </>
              ) : (
                <p className="suave">—</p>
              )}
            </section>
            {a.rayos != null && (
              <section className="tarjeta tarjeta-rayos">
                <h3>Rayos</h3>
                <p className="numero-medio">
                  {a.rayos}
                  <sup>{a.rayos === 1 ? "rayo hoy" : "rayos hoy"}</sup>
                </p>
                <p className="suave">
                  {a.rayos_dist != null && a.rayos_ts
                    ? `El último, a ${n(a.rayos_dist, 0)} km, ${e.ahora - a.rayos_ts < 86400 ? `a las ${hora(a.rayos_ts)}` : `el ${fechaCorta(fechaDe(a.rayos_ts), true)}`}`
                    : "Sin rayos registrados"}
                  {" · "}detector de la estación (alcance de unos 40 km)
                </p>
              </section>
            )}
            <section className="tarjeta">
              <h3>Estado de la estación</h3>
              <p className="numero-medio">
                {e.hoy?.lecturas ?? 0}
                <sup>lecturas hoy</sup>
              </p>
              <p className="suave">
                {FUENTES[a.fuente] ?? a.fuente}
                {a.fuente === "ecowitt_api" && estacion.fuente === "directo" ? " (reserva)" : ""} · última a las {hora(a.ts)}
              </p>
            </section>
          </div>
        </>
      )}

      <CabeceraSeccion
        titulo="Últimas horas"
        nota={`Un punto cada 5 minutos${horas === 24 ? " · en gris, la temperatura de ayer a la misma hora" : ""} · la franja sombreada es la noche`}
      />
      <div className="periodos" role="tablist">
        {PERIODOS.map((p) => (
          <button key={p.horas} role="tab" aria-selected={horas === p.horas} onClick={() => setHoras(p.horas)}>
            {p.nombre}
          </button>
        ))}
      </div>
      {historico && historico.length > 1 ? (
        (() => {
          const marco = crearMarco(corte, e.ahora, horas, estacion.lat, estacion.lon);
          return (
            <>
              <FranjaPeriodo datos={historico} />
              <div className="rejilla-2">
                <Panel titulo="Temperatura y humedad" nota="°C · %">
                  <GraficaTempHum datos={historico} marco={marco} ayer={ayer} />
                </Panel>
                <Panel titulo="Presión atmosférica" nota="hPa, reducida al nivel del mar">
                  <GraficaPresion datos={historico} marco={marco} />
                </Panel>
                <Panel titulo="Viento" nota="km/h">
                  <GraficaViento datos={historico} marco={marco} />
                </Panel>
                <Panel titulo="Dirección del viento" nota="de dónde sopla · punto más grande = más viento">
                  <GraficaDireccion datos={historico} marco={marco} />
                </Panel>
                <Panel titulo="Precipitación" nota="mm · mm/h">
                  <GraficaLluvia datos={historico} marco={marco} />
                </Panel>
                <Panel titulo="Radiación solar y UV" nota="W/m² · índice UV">
                  <GraficaSol datos={historico} marco={marco} />
                </Panel>
                {historico.some((p) => p.rayos !== null && p.rayos !== undefined) && (
                  <Panel titulo="Rayos" nota="detectados por la estación · km del último">
                    {historico.some((p) => (p.rayos ?? 0) > 0) ? (
                      <GraficaRayos datos={historico} marco={marco} />
                    ) : (
                      <p className="vacio">Ningún rayo en este periodo.</p>
                    )}
                  </Panel>
                )}
              </div>
            </>
          );
        })()
      ) : (
        <p className="vacio">Aún no hay suficientes datos para las gráficas.</p>
      )}

      {diasGrafica.length > 1 && (
        <>
          <CabeceraSeccion titulo="Día a día" nota="El resumen de cada día · pulsa un día para ver todos sus datos" />
          <div className="periodos" role="tablist">
            {PERIODOS_DIAS.map((p) => (
              <button key={p.dias} role="tab" aria-selected={periodoDias === p.dias} onClick={() => setPeriodoDias(p.dias)}>
                {p.nombre}
              </button>
            ))}
          </div>
          <div className="rejilla-2">
            <Panel titulo="Temperatura" nota="°C · franja de la mínima a la máxima, y la media">
              <DiariaTemp dias={diasGrafica} onDia={setDiaConsulta} />
            </Panel>
            <Panel titulo="Precipitación" nota="mm cada día · acumulado del periodo">
              <DiariaLluvia dias={diasGrafica} onDia={setDiaConsulta} />
            </Panel>
            <Panel titulo="Viento" nota="km/h · racha máxima y viento medio">
              <DiariaViento dias={diasGrafica} onDia={setDiaConsulta} />
            </Panel>
            <Panel titulo="Presión atmosférica" nota="hPa · mínima y máxima de cada día">
              <DiariaPresion dias={diasGrafica} onDia={setDiaConsulta} />
            </Panel>
            <Panel titulo="Humedad" nota="% · mínima y máxima de cada día">
              <DiariaHumedad dias={diasGrafica} onDia={setDiaConsulta} />
            </Panel>
            <Panel titulo="Radiación solar y UV" nota="máximos de cada día">
              <DiariaSol dias={diasGrafica} onDia={setDiaConsulta} />
            </Panel>
            {diasGrafica.some((d) => (d.rayos ?? 0) > 0) && (
              <Panel titulo="Rayos" nota="detectados cada día">
                <DiariaRayos dias={diasGrafica} onDia={setDiaConsulta} />
              </Panel>
            )}
          </div>
          {todosDias && todosDias.length > 0 && (
            <>
              <CabeceraSeccion titulo="Mes a mes" nota="Medias, totales y días señalados de cada mes" />
              <TablaMeses dias={todosDias} />
            </>
          )}
        </>
      )}

      <CabeceraSeccion titulo="Precipitación acumulada" nota="Incluida la precipitación de hoy" />
      <div className="rejilla-2">
        <section className="tarjeta">
          <h3>Año hidrológico</h3>
          <p className="suave">Desde el 1 de octubre</p>
          <p className="numero-medio lluvia">
            {n(e.lluvia.hidrologico)}
            <sup>mm</sup>
          </p>
        </section>
        <section className="tarjeta">
          <h3>Año agrícola</h3>
          <p className="suave">Desde el 1 de septiembre</p>
          <p className="numero-medio lluvia">
            {n(e.lluvia.agricola)}
            <sup>mm</sup>
          </p>
        </section>
      </div>

      <CabeceraSeccion titulo="Extremos y récords" nota={e.desde ? `Datos desde el ${fechaCorta(e.desde, true)}` : undefined} />
      <TablaExtremos titulo={capital(nombreMes(fechaDe(e.ahora).slice(0, 7)))} ex={e.mes} tipo="mes" />
      <ExtremosAnio base={base} actual={e.anio} anioActual={Number(fechaDe(e.ahora).slice(0, 4))} desde={e.desde} />
      <TablaExtremos titulo="Récords de la estación" ex={e.records} tipo="records" />

      <ConsultarDia base={base} hoy={fechaDe(e.ahora)} desde={e.desde} elegido={diaConsulta} />

      <CabeceraSeccion titulo="La estación" nota="Emplazamiento y equipo" />
      <FichaEstacion estacion={estacion} />
    </>
  );
}

function Dato({ e, v }: { e: string; v: number | null }) {
  return (
    <div>
      <small>{e}</small>
      <b>
        {n(v)}
        <span>mm</span>
      </b>
    </div>
  );
}

/** Pluviómetro dibujado: se llena hasta 30 mm (o más si hace falta). */
function Pluviometro({ mm }: { mm: number }) {
  const tope = mm > 30 ? Math.ceil(mm / 10) * 10 : 30;
  const alto = 80;
  const nivel = (mm / tope) * alto;
  return (
    <svg viewBox="0 0 70 110" className="pluviometro" aria-hidden="true">
      <path d="M8 6 h44 l-12 16 v4 h-20 v-4 z" className="pluv-embudo" />
      <rect x="20" y={26} width="20" height={alto} rx="3" className="pluv-tubo" />
      <rect x="20" y={26 + alto - nivel} width="20" height={nivel} rx="3" className="pluv-agua" />
      {[0, 10, 20, 30].map((v) => (
        <g key={v}>
          <line x1="42" x2="47" y1={26 + alto - (v / tope) * alto} y2={26 + alto - (v / tope) * alto} className="pluv-marca" />
          <text x="50" y={29 + alto - (v / tope) * alto} className="pluv-texto">
            {Math.round((v / 30) * tope)}
          </text>
        </g>
      ))}
    </svg>
  );
}

type Fila = [string, Extremo | null, string, number, "calor" | "frio" | "lluvia" | "viento" | "sol" | "", boolean];

function TablaExtremos({ titulo, ex, tipo }: { titulo: string; ex: Extremos; tipo: "mes" | "anio" | "records" }) {
  const conAnio = tipo === "records";
  const filas: Fila[] = [
    ["Temp. máxima", ex.tmax, "°C", 1, "calor", true],
    ["Temp. mínima", ex.tmin, "°C", 1, "frio", true],
    ["Humedad mínima", ex.hum_min, "%", 0, "", false],
    ["Viento medio máximo", ex.viento_max, "km/h", 1, "viento", false],
    ["Racha máxima", ex.racha_max, "km/h", 1, "viento", true],
    ["Presión máxima", ex.presion_max, "hPa", 1, "", false],
    ["Presión mínima", ex.presion_min, "hPa", 1, "", false],
    ["Día con más precipitación", ex.lluvia_dia_max, "mm", 1, "lluvia", false],
    ["Intensidad máx. de precipitación", ex.intensidad_max, "mm/h", 1, "lluvia", true],
    ["Radiación solar máxima", ex.radiacion_max, "W/m²", 0, "sol", false],
    ["Índice UV máximo", ex.uv_max, "", 0, "sol", false],
  ];
  const cuando = (x: Extremo) => `${fechaCorta(x.fecha, conAnio)}${x.ts ? ` · ${hora(x.ts)}` : ""}`;
  return (
    <section className="tarjeta tabla-extremos">
      <h3 className="titulo-acento">{titulo}</h3>
      {ex.dias === 0 ? (
        <p className="suave">Todavía no hay datos.</p>
      ) : (
        <div className="extremos-columnas">
          {tipo !== "records" && (
            <>
              <FilaExtremo nombre="Media de máximas" valor={n(ex.media_tmax)} unidad="°C" clase="calor" cuando={`${ex.dias} días`} />
              <FilaExtremo nombre="Media de mínimas" valor={n(ex.media_tmin)} unidad="°C" clase="frio" cuando={`${ex.dias} días`} />
              <FilaExtremo nombre="Precipitación total" valor={n(ex.lluvia_total)} unidad="mm" clase="lluvia" cuando="acumulado" />
              <FilaExtremo nombre="Días de precipitación" valor={String(ex.dias_lluvia)} unidad="" clase="lluvia" cuando="≥ 0,2 mm" />
            </>
          )}
          {filas.map(([nombre, x, unidad, dec, clase, conHora]) =>
            x ? (
              <FilaExtremo
                key={nombre}
                nombre={nombre}
                valor={n(x.valor, dec)}
                unidad={unidad}
                clase={clase}
                cuando={conHora ? cuando(x) : fechaCorta(x.fecha, conAnio)}
              />
            ) : null,
          )}
          {tipo !== "mes" && ex.mes_mas_lluvioso && (
            <FilaExtremo
              nombre="Mes con más precipitación"
              valor={n(ex.mes_mas_lluvioso.valor)}
              unidad="mm"
              clase="lluvia"
              cuando={nombreMes(ex.mes_mas_lluvioso.mes)}
            />
          )}
        </div>
      )}
    </section>
  );
}

/** Extremos de un año, con selector (el año en curso viene ya con la página). */
function ExtremosAnio({ base, actual, anioActual, desde }: { base: string; actual: Extremos; anioActual: number; desde: string | null }) {
  const [anio, setAnio] = useState(anioActual);
  const primero = desde ? Number(desde.slice(0, 4)) : anioActual;
  const anios = Array.from({ length: anioActual - primero + 1 }, (_, i) => anioActual - i);
  const { datos: otro } = usePeticion<Extremos>(anio === anioActual ? null : `${base}/extremos?anio=${anio}`);
  const ex = anio === anioActual ? actual : otro;
  return (
    <div className="extremos-anio">
      {anios.length > 1 && (
        <div className="periodos" role="tablist" aria-label="Año">
          {anios.map((y) => (
            <button key={y} role="tab" aria-selected={anio === y} onClick={() => setAnio(y)}>
              {y}
            </button>
          ))}
        </div>
      )}
      {ex ? <TablaExtremos titulo={`Año ${anio}${anio === anioActual ? " (hasta hoy)" : ""}`} ex={ex} tipo="anio" /> : <div className="tarjeta" style={{ minHeight: 200 }} />}
    </div>
  );
}

function FilaExtremo({ nombre, valor, unidad, clase, cuando }: { nombre: string; valor: string; unidad: string; clase: string; cuando: string }) {
  return (
    <div className="fila-extremo">
      <span>{nombre}</span>
      <b className={clase}>
        {valor} {unidad}
      </b>
      <small className="mono">{cuando}</small>
    </div>
  );
}

function ConsultarDia({ base, hoy, desde, elegido }: { base: string; hoy: string; desde: string | null; elegido: string | null }) {
  const [fecha, setFecha] = useState(sumarDias(hoy, -1));
  // Al pulsar un día en las gráficas diarias: se abre aquí y se baja hasta él
  useEffect(() => {
    if (!elegido) return;
    setFecha(elegido);
    document.getElementById("consultar-dia")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [elegido]);
  const { datos: r } = usePeticion<ResumenDiario | null>(`${base}/dia?fecha=${fecha}`, 0);
  const minimo = desde ?? hoy;
  const deHoja = r?.origen === "hoja";
  // [título, valor, unidad, hora, ¿hay dato?]: los días de la hoja de cálculo solo tienen algunos (se ocultan los demás)
  const todas: [string, string, string, string | null, boolean][] = r
    ? [
        ["Temp. máxima", n(r.tmax), "°C", r.tmax_ts ? hora(r.tmax_ts) : null, r.tmax !== null],
        ["Temp. mínima", n(r.tmin), "°C", r.tmin_ts ? hora(r.tmin_ts) : null, r.tmin !== null],
        ["Temp. media", n(mediaTemp(r)), "°C", null, mediaTemp(r) !== null],
        ["Humedad máx. / mín.", `${n(r.hum_max, 0)} / ${n(r.hum_min, 0)}`, "%", null, r.hum_max !== null],
        ["Viento medio máx.", n(r.viento_max), "km/h", null, r.viento_max !== null],
        ["Racha máxima", n(r.racha_max, 0), "km/h", r.racha_max_ts ? hora(r.racha_max_ts) : null, r.racha_max !== null],
        ["Presión máx. / mín.", `${n(r.presion_max)} / ${n(r.presion_min)}`, "hPa", null, r.presion_max !== null],
        ["Precipitación", n(r.lluvia), "mm", null, r.lluvia !== null],
        ["Intensidad máx.", n(r.intensidad_max), "mm/h", r.intensidad_max ? hora(r.intensidad_max_ts) : null, r.intensidad_max !== null],
        ["Radiación solar máx.", n(r.radiacion_max, 0), "W/m²", null, r.radiacion_max !== null],
        ["Índice UV máx.", n(r.uv_max, 0), "", null, r.uv_max !== null],
        ["Rayos", String(r.rayos ?? "—"), "", null, r.rayos !== null && r.rayos !== undefined],
      ]
    : [];
  const casillas = todas.filter((c) => !deHoja || c[4]).map(([t, v, u, h]) => [t, v, u, h] as const);
  return (
    <>
      <CabeceraSeccion id="consultar-dia" titulo="Consultar un día" nota={`Extremos de cualquier día desde el ${fechaCorta(minimo, true)}`} />
      <section className="tarjeta consultar">
        <div className="consultar-barra">
          <button onClick={() => setFecha(sumarDias(fecha, -1))} disabled={fecha <= minimo} aria-label="Día anterior">
            ‹
          </button>
          <label>
            <span>{capital(fechaCompleta(fecha))}</span>
            <input type="date" value={fecha} min={minimo} max={hoy} onChange={(ev) => ev.target.value && setFecha(ev.target.value)} />
          </label>
          <button onClick={() => setFecha(sumarDias(fecha, 1))} disabled={fecha >= hoy} aria-label="Día siguiente">
            ›
          </button>
        </div>
        {r && deHoja && (
          <p className="aviso-hoja suave pequeno">
            Día anterior a ecowitt.net: sale de la hoja de cálculo de la estación, que guarda los extremos del día sin su hora (ni humedad,
            presión o radiación).
          </p>
        )}
        {r ? (
          <div className="casillas">
            {casillas.map(([t, v, u, h]) => (
              <div key={t}>
                <small className="mono">{t.toUpperCase()}</small>
                <b>
                  {v}
                  <span>{u}</span>
                </b>
                {h && <small className="mono">{h}</small>}
              </div>
            ))}
          </div>
        ) : (
          <p className="suave">No hay datos de ese día.</p>
        )}
      </section>
    </>
  );
}

function FichaEstacion({ estacion: e }: { estacion: InfoEstacion }) {
  return (
    <section className="tarjeta ficha">
      <p>
        {e.descripcion ??
          (e.tipo === "oficial"
            ? `Estación oficial de ${e.red ?? "una red pública"} en ${e.municipio} (${e.provincia}), a ${e.altitud} metros sobre el nivel del mar.`
            : e.tipo === "externa"
              ? `Estación de aficionado de la red ${e.red ?? "Meteoclimatic"} en ${e.municipio} (${e.provincia}), a unos ${e.altitud} metros sobre el nivel del mar. Sus datos son los que publica en ${e.red ?? "Meteoclimatic"} (licencia CC BY-NC-ND), cada 10 minutos.`
            : `Estación meteorológica particular en ${e.municipio} (${e.provincia}), a ${e.altitud} metros sobre el nivel del mar.`)}
      </p>
      <dl className="ficha-datos">
        <div>
          <dt>Altitud</dt>
          <dd>{e.altitud} m</dd>
        </div>
        <div>
          <dt>Coordenadas</dt>
          <dd className="mono">
            {e.lat.toFixed(4)}, {e.lon.toFixed(4)}
          </dd>
        </div>
        <div>
          <dt>Datos</dt>
          <dd>{FUENTES[e.fuente] ?? e.fuente}</dd>
        </div>
        {e.equipo && (
          <div>
            <dt>Equipo</dt>
            <dd>{e.equipo}</dd>
          </div>
        )}
        {e.propietario && (
          <div>
            <dt>Responsable</dt>
            <dd>{e.propietario}</dd>
          </div>
        )}
        {e.meteoclimatic && (
          <div>
            <dt>Meteoclimatic</dt>
            <dd>
              <a href={`https://www.meteoclimatic.net/perfil/${e.meteoclimatic}`} target="_blank" rel="noreferrer">
                {e.meteoclimatic} ↗
              </a>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
