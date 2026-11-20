import type { RespuestaRed, UsuarioSesion } from "../../shared/tipos";
import { enDirecto as enDirectoEstacion } from "../estaciones";
import { hora } from "../formato";
import { Logo } from "./Cabecera";

export default function Pie({ red, usuario }: { red: RespuestaRed | null; usuario: UsuarioSesion | null }) {
  const enDirecto = red?.estaciones.filter((d) => enDirectoEstacion(d, red.ahora)).length ?? 0;
  return (
    <footer className="pie">
      <div className="pie-dentro">
        <div className="pie-marca">
          <a href="/" className="marca">
            <Logo />
            <span>
              Meteo<b>star</b>
            </span>
          </a>
          <p>
            Red de estaciones meteorológicas de {red?.red.lugar ?? "Villastar"} y alrededores: el tiempo en directo, la previsión, el radar, el satélite, el
            río y los embalses.
          </p>
          {red && (
            <p className="pie-estado">
              <i className={enDirecto ? "" : "apagado"} />
              <span>
                {enDirecto} de {red.estaciones.length} estaciones en directo · actualizado a las {hora(red.ahora)}
              </span>
            </p>
          )}
        </div>

        <nav className="pie-columnas" aria-label="Pie de página">
          <div>
            <h3>El tiempo</h3>
            <a href="/">Principal</a>
            <a href="/prevision">Previsión por horas</a>
            <a href="/prevision/14-dias">Previsión a 14 días</a>
          </div>
          <div>
            <h3>Seguimiento</h3>
            <a href="/radar">Radar</a>
            <a href="/satelite">Satélite</a>
          </div>
          <div>
            <h3>Hidrología</h3>
            <a href="/rios">Ríos</a>
            <a href="/embalses">Embalses</a>
          </div>
          <div>
            <h3>Meteostar</h3>
            {usuario ? <a href="/cuenta">Mi cuenta</a> : <a href="/entrar">Entrar</a>}
            {usuario && <a href="/cuenta/estacion/nueva">Añadir una estación</a>}
            <a href="/fuentes">Fuentes de datos</a>
          </div>
        </nav>
      </div>
      <div className="pie-base">
        <span>© {new Date().getFullYear()} Meteostar</span>
        <span>Hecho por Javier Mengod</span>
      </div>
    </footer>
  );
}
