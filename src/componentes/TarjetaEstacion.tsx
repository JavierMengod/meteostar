import type { ReactNode } from "react";
import type { RespuestaDatos } from "../../shared/tipos";
import { puntoCardinal } from "../../shared/meteo";
import { n } from "../formato";
import { BarraMinMax, Directo, Tendencia } from "./Piezas";

/** Tarjeta de una estación en la portada: temperatura, tendencia, mín./máx. del día y lo básico. */
export default function TarjetaEstacion({ d, escala, accion }: { d: RespuestaDatos; escala?: [number, number]; accion?: ReactNode }) {
  const { estacion: e, actual: a, hoy } = d;
  const viento = a?.viento ?? null;
  const oficial = e.tipo === "oficial";
  const externa = e.tipo === "externa";
  return (
    <a href={`/estacion/${e.slug}`} className={`tarjeta tarjeta-estacion enlace ${oficial ? "oficial" : ""}`}>
      <div className="te-cabecera">
        <div>
          <h3>{e.nombre}</h3>
          <p>
            {e.municipio} · {e.altitud} m
          </p>
        </div>
        <span className="te-acciones">
          <Directo lectura={a} ahora={d.ahora} />
          {accion}
        </span>
      </div>
      {oficial && <span className="insignia">{e.red ?? "Oficial"} · datos horarios</span>}
      {externa && <span className="insignia">{e.red ?? "Otra red"} · cada 10 min</span>}
      {a ? (
        <>
          <div className="te-temp">
            <span className="numero-grande">
              {n(a.temp)}
              <sup>°C</sup>
            </span>
            <Tendencia actual={a.temp} antes={d.temp1h} unidad="°" sufijo="/ h" />
          </div>
          <BarraMinMax min={hoy?.tmin ?? null} max={hoy?.tmax ?? null} actual={a.temp} escalaMin={escala?.[0]} escalaMax={escala?.[1]} />
          <div className="te-minmax">
            <span>
              Mín. <b className="frio">{n(hoy?.tmin)}°</b>
            </span>
            <span>
              Máx. <b className="calor">{n(hoy?.tmax)}°</b>
            </span>
          </div>
          <div className="te-datos">
            <div>
              <small>Humedad</small>
              <b>💧 {n(a.hum, 0)} %</b>
            </div>
            <div>
              <small>Viento</small>
              <b>{viento === null ? "—" : viento < 2 ? "Calma" : `${n(viento, 0)} km/h ${puntoCardinal(a.dir)}`}</b>
            </div>
            <div>
              <small>Lluvia hoy</small>
              <b>{n(a.lluvia_dia)} mm</b>
            </div>
          </div>
        </>
      ) : (
        <p className="vacio">Esperando los primeros datos…</p>
      )}
    </a>
  );
}
