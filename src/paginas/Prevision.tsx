import type { PrevisionHora, RespuestaPrevision } from "../../shared/tipos";
import { puntoCardinal } from "../../shared/meteo";
import Icono from "../componentes/Icono";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import { navegar, usePeticion } from "../datos";
import { capital, diaSemana, fechaCorta, fechaDe, hora, n } from "../formato";
import { descripcion, textoDia } from "../prevision";

const horaDe = (t: number) => Number(hora(t).slice(0, 2));

function Fuente({ p }: { p: RespuestaPrevision }) {
  return (
    <p className="nota-fuente">
      Datos:{" "}
      <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
        Open-Meteo
      </a>{" "}
      (CC BY 4.0) · actualizada a las {hora(p.generado)}
    </p>
  );
}

/** Un lugar que se puede elegir para la previsión. */
export interface OpcionLugar {
  clave: string;
  nombre: string;
  grupo: string;
  lat: number;
  lon: number;
  altitud: number;
}

/** Previsión del lugar elegido en la URL (?lugar=…), o del primero de la lista. */
function usePrevisionLugar(lugares: OpcionLugar[], clave: string | null) {
  const lugar = lugares.find((l) => l.clave === clave) ?? lugares[0];
  const url = lugar ? `/api/prevision?lat=${lugar.lat}&lon=${lugar.lon}&alt=${lugar.altitud}` : null;
  const { datos, error } = usePeticion<RespuestaPrevision>(url, 30 * 60_000);
  return { lugar, prevision: datos, error };
}

function SelectorLugar({ lugares, lugar, ruta }: { lugares: OpcionLugar[]; lugar: OpcionLugar; ruta: string }) {
  const grupos = [...new Set(lugares.map((l) => l.grupo))];
  return (
    <div className="lugar">
      <label className="selector-lugar">
        <span aria-hidden="true">📍</span>
        <select value={lugar.clave} onChange={(e) => navegar(`${ruta}?lugar=${encodeURIComponent(e.target.value)}`, true)} aria-label="Lugar">
          {grupos.map((g) => (
            <optgroup key={g} label={g}>
              {lugares
                .filter((l) => l.grupo === g)
                .map((l) => (
                  <option key={l.clave} value={l.clave}>
                    {l.nombre}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <span className="suave">{lugar.altitud} m</span>
      <a href="/cuenta#lugares" className="pequeno">
        + Añadir un lugar
      </a>
    </div>
  );
}

export function PorHoras({ lugares, clave }: { lugares: OpcionLugar[]; clave: string | null }) {
  const { lugar, prevision, error } = usePrevisionLugar(lugares, clave);
  if (!prevision || !lugar) return <Cargando error={error} />;
  const horas = prevision.horas;
  const proxima = horas.find((h) => h.lluvia >= 0.1);
  const total = horas.reduce((s, h) => s + h.lluvia, 0);
  const conLluvia = horas.filter((h) => h.lluvia >= 0.1).length;
  const tmin = horas.reduce((m, h) => (h.temp < m.temp ? h : m), horas[0]);
  const tmax = horas.reduce((m, h) => (h.temp > m.temp ? h : m), horas[0]);
  const racha = horas.reduce((m, h) => (h.racha > m.racha ? h : m), horas[0]);
  const cuando = (h: PrevisionHora) => {
    const f = fechaDe(h.t);
    const hoy = fechaDe(prevision.generado);
    const dia = f === hoy ? "hoy" : diaSemana(f) === diaSemana(fechaDe(prevision.generado + 86400)) ? "mañana" : diaSemana(f);
    return `${dia} a las ${hora(h.t)}`;
  };

  return (
    <>
      <SelectorLugar lugares={lugares} lugar={lugar} ruta="/prevision" />
      <CabeceraSeccion titulo="Las próximas 48 horas" />
      <Fuente p={prevision} />
      <div className="rejilla-4">
        <div className="tarjeta resumen-dato">
          <small className="mono">PRÓXIMA PRECIPITACIÓN</small>
          <b className="lluvia">{proxima ? capital(cuando(proxima)) : "Sin lluvia"}</b>
          <span className="suave">{proxima ? descripcion(proxima.codigo) : "en las próximas 48 horas"}</span>
        </div>
        <div className="tarjeta resumen-dato">
          <small className="mono">PRECIPITACIÓN EN 48 HORAS</small>
          <b className="lluvia">{n(total)} mm</b>
          <span className="suave">{conLluvia} horas con precipitación</span>
        </div>
        <div className="tarjeta resumen-dato">
          <small className="mono">TEMPERATURA</small>
          <b>
            <span className="frio">{n(tmin.temp)}°</span> / <span className="calor">{n(tmax.temp)}°</span>
          </b>
          <span className="suave">
            mín. {cuando(tmin)} · máx. {cuando(tmax)}
          </span>
        </div>
        <div className="tarjeta resumen-dato">
          <small className="mono">RACHA MÁXIMA</small>
          <b>{racha.racha} km/h</b>
          <span className="suave">{cuando(racha)}</span>
        </div>
      </div>

      <div className="tarjeta grafica-horas">
        <GraficaHoras horas={horas} />
        <div className="leyenda-horas">
          <span>
            <i className="l-temp" /> Temperatura
          </span>
          <span>
            <i className="l-lluvia" /> Precipitación (mm/h)
          </span>
          <span>
            <i className="l-prob" /> Probabilidad de precipitación
          </span>
          <span>
            <i className="l-noche" /> Noche
          </span>
        </div>
      </div>

      <CabeceraSeccion titulo="Hora a hora" nota="Desliza para ver las 48 horas" />
      <div className="hora-a-hora">
        {horas.map((h) => (
          <div key={h.t} className={`hora-tarjeta ${h.dia ? "" : "noche"}`}>
            <small className="mono">{hora(h.t)}</small>
            {horaDe(h.t) === 0 && <small className="cambio-dia">{capital(diaSemana(fechaDe(h.t)))}</small>}
            <Icono codigo={h.codigo} dia={h.dia} size={38} />
            <b>{Math.round(h.temp)}°</b>
            <span className="lluvia">{h.lluvia >= 0.1 ? `${n(h.lluvia)} mm` : "—"}</span>
            <small className="lluvia">{h.prob} %</small>
            <small>
              <Flecha dir={h.dir} /> {h.viento}
            </small>
            <small className="suave">rachas {h.racha}</small>
          </div>
        ))}
      </div>
    </>
  );
}

function Flecha({ dir }: { dir: number }) {
  // Apunta hacia donde va el viento (viene de `dir`)
  return (
    <svg viewBox="0 0 12 12" className="flecha-viento" style={{ transform: `rotate(${dir + 180}deg)` }} aria-label={puntoCardinal(dir)}>
      <path d="M6 1 L9.5 10 L6 8 L2.5 10 Z" />
    </svg>
  );
}

/** Gráfica de 48 h en SVG: noche sombreada, iconos, temperatura, lluvia y viento. */
function GraficaHoras({ horas }: { horas: PrevisionHora[] }) {
  const paso = 30;
  const izq = 34;
  const ancho = izq + horas.length * paso + 10;
  const yIconos = 6;
  const yTemp0 = 70;
  const altoTemp = 120;
  const yLluvia0 = yTemp0 + altoTemp + 30;
  const altoLluvia = 50;
  const yViento = yLluvia0 + altoLluvia + 22;
  const yHoras = yViento + 48;
  const alto = yHoras + 8;
  const temps = horas.map((h) => h.temp);
  const tMin = Math.floor(Math.min(...temps) - 1);
  const tMax = Math.ceil(Math.max(...temps) + 1);
  const yT = (t: number) => yTemp0 + altoTemp - ((t - tMin) / (tMax - tMin)) * altoTemp;
  const lMax = Math.max(2, ...horas.map((h) => h.lluvia));
  const x = (i: number) => izq + i * paso + paso / 2;
  const linea = horas.map((h, i) => `${i ? "L" : "M"}${x(i)} ${yT(h.temp)}`).join(" ");
  const area = `${linea} L${x(horas.length - 1)} ${yTemp0 + altoTemp} L${x(0)} ${yTemp0 + altoTemp} Z`;
  const pasoT = tMax - tMin > 12 ? 4 : 2;

  return (
    <div className="desliza">
      <svg width={ancho} height={alto} className="svg-horas">
        <defs>
          <linearGradient id="g-temp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--c-temp)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--c-temp)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {horas.map((h, i) =>
          h.dia ? null : <rect key={`n${i}`} x={izq + i * paso} y={0} width={paso} height={yHoras - 14} className="h-noche" />,
        )}
        {horas.map((h, i) =>
          horaDe(h.t) === 0 ? (
            <g key={`d${i}`}>
              <line x1={izq + i * paso} x2={izq + i * paso} y1={0} y2={yHoras - 14} className="h-dia" />
              <text x={izq + i * paso + 4} y={yTemp0 - 18} className="h-dia-texto">
                {capital(diaSemana(fechaDe(h.t)))}
              </text>
            </g>
          ) : null,
        )}
        {/* Eje de temperatura */}
        {Array.from({ length: Math.floor((tMax - tMin) / pasoT) + 1 }, (_, k) => tMin + k * pasoT).map((t) => (
          <g key={t}>
            <line x1={izq} x2={ancho} y1={yT(t)} y2={yT(t)} className="h-rejilla" />
            <text x={izq - 6} y={yT(t) + 4} className="h-eje">
              {t}°
            </text>
          </g>
        ))}
        <path d={area} fill="url(#g-temp)" />
        <path d={linea} className="h-temp" />
        {horas.map((h, i) =>
          i % 3 === 0 ? (
            <g key={`t${i}`}>
              <circle cx={x(i)} cy={yT(h.temp)} r="2.5" className="h-punto" />
              <text x={x(i)} y={yT(h.temp) - 7} className="h-valor">
                {Math.round(h.temp)}°
              </text>
              <g transform={`translate(${x(i) - 14} ${yIconos})`}>
                <foreignObject width="28" height="28">
                  <Icono codigo={h.codigo} dia={h.dia} size={28} />
                </foreignObject>
              </g>
            </g>
          ) : null,
        )}
        {/* Precipitación */}
        <text x={izq + 4} y={yLluvia0 - 6} className="h-titulo">
          PRECIPITACIÓN · MM POR HORA
        </text>
        <line x1={izq} x2={ancho} y1={yLluvia0 + altoLluvia} y2={yLluvia0 + altoLluvia} className="h-rejilla" />
        {horas.map((h, i) => (
          <g key={`l${i}`}>
            <rect
              x={izq + i * paso + 3}
              y={yLluvia0 + altoLluvia - (h.prob / 100) * altoLluvia}
              width={paso - 6}
              height={(h.prob / 100) * altoLluvia}
              className="h-prob"
            />
            {h.lluvia > 0 && (
              <rect
                x={izq + i * paso + 7}
                y={yLluvia0 + altoLluvia - (h.lluvia / lMax) * altoLluvia}
                width={paso - 14}
                height={(h.lluvia / lMax) * altoLluvia}
                className="h-lluvia"
              />
            )}
          </g>
        ))}
        {/* Viento */}
        <text x={izq + 4} y={yViento - 8} className="h-titulo">
          VIENTO · KM/H
        </text>
        {horas.map((h, i) =>
          i % 2 === 0 ? (
            <g key={`v${i}`} transform={`translate(${x(i)} ${yViento + 6})`}>
              <path d="M0 -7 L4 6 L0 3 L-4 6 Z" transform={`rotate(${h.dir + 180})`} className="h-flecha" />
              <text y="20" className="h-viento">
                {h.viento}
              </text>
            </g>
          ) : null,
        )}
        {horas.map((h, i) =>
          i % 3 === 0 ? (
            <text key={`h${i}`} x={x(i)} y={yHoras} className="h-hora">
              {hora(h.t)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export function Dias({ lugares, clave }: { lugares: OpcionLugar[]; clave: string | null }) {
  const { lugar, prevision, error } = usePrevisionLugar(lugares, clave);
  if (!prevision || !lugar) return <Cargando error={error} />;
  const dias = prevision.dias;
  const lo = Math.min(...dias.map((d) => d.tmin));
  const hi = Math.max(...dias.map((d) => d.tmax));
  const pos = (t: number) => ((t - lo) / (hi - lo)) * 100;
  return (
    <>
      <SelectorLugar lugares={lugares} lugar={lugar} ruta="/prevision/14-dias" />
      <CabeceraSeccion titulo="Los próximos 14 días" />
      <Fuente p={prevision} />
      {dias[1] && (
        <div className="tarjeta resumen-prevision">
          <Icono codigo={dias[1].codigo} size={64} />
          <div>
            <h3>
              Mañana, {diaSemana(dias[1].fecha)} {fechaCorta(dias[1].fecha)}
            </h3>
            <p>{textoDia(dias[1], prevision.horas)}</p>
          </div>
        </div>
      )}
      <div className="tarjeta lista-dias">
        {dias.map((d, i) => (
          <div key={d.fecha} className="fila-dia">
            <div className="fd-fecha">
              <b>{i === 0 ? "Hoy" : i === 1 ? "Mañana" : capital(diaSemana(d.fecha))}</b>
              <small>{fechaCorta(d.fecha)}</small>
            </div>
            <Icono codigo={d.codigo} size={40} />
            <span className="fd-desc">{descripcion(d.codigo)}</span>
            <div className="fd-temps">
              <b className="frio">{Math.round(d.tmin)}°</b>
              <div className="fd-barra">
                <i style={{ left: `${pos(d.tmin)}%`, right: `${100 - pos(d.tmax)}%` }} />
              </div>
              <b className="calor">{Math.round(d.tmax)}°</b>
            </div>
            <div className="fd-lluvia">
              <b className="lluvia">{d.prob} %</b>
              <small>{d.lluvia >= 0.1 ? `${n(d.lluvia)} mm` : "0 mm"}</small>
            </div>
            <div className="fd-viento">
              <span>
                <Flecha dir={d.dir} /> {puntoCardinal(d.dir)} {d.viento}
              </span>
              <small>rachas {d.racha} km/h</small>
            </div>
          </div>
        ))}
      </div>
      <p className="nota-fuente">A partir del día 7 la previsión es orientativa: su fiabilidad baja mucho.</p>
    </>
  );
}
