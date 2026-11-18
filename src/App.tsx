import type { RespuestaCuenta, RespuestaPrevision, RespuestaRed } from "../shared/tipos";
import Cabecera from "./componentes/Cabecera";
import Pie from "./componentes/Pie";
import { Cargando } from "./componentes/Piezas";
import { Sesion, TemaContexto, useEstadoSesion, usePeticion, useRuta, useTema } from "./datos";
import { Entrar, PrimerosPasos, Registro } from "./paginas/Acceso";
import Admin from "./paginas/Admin";
import Cuenta from "./paginas/Cuenta";
import EditorEstacion from "./paginas/EditorEstacion";
import EmbalseDetalle from "./paginas/EmbalseDetalle";
import Fuentes from "./paginas/Fuentes";
import Embalses from "./paginas/Embalses";
import Rios from "./paginas/Rios";
import RioDetalle from "./paginas/RioDetalle";
import Estacion from "./paginas/Estacion";
import { Dias, PorHoras, type OpcionLugar } from "./paginas/Prevision";
import Red from "./paginas/Red";
import Estaciones from "./paginas/Estaciones";
import { Radar, Satelite } from "./paginas/Seguimiento";

export default function App() {
  const ruta = useRuta();
  const sesion = useEstadoSesion();
  const tema = useTema(sesion);
  const { datos: red } = usePeticion<RespuestaRed>("/api/red");
  const { datos: prevision } = usePeticion<RespuestaPrevision>("/api/prevision", 30 * 60_000);
  // Los lugares del usuario, para la previsión
  const { datos: cuenta } = usePeticion<RespuestaCuenta>(sesion.usuario && (ruta.pagina === "horas" || ruta.pagina === "dias") ? "/api/cuenta" : null, 0);

  const lugares: OpcionLugar[] = red
    ? [
        { clave: "red", nombre: red.red.lugar, grupo: "Red", lat: red.red.lat, lon: red.red.lon, altitud: red.red.altitud },
        ...red.estaciones.map((d) => ({
          clave: `e:${d.estacion.slug}`,
          nombre: d.estacion.nombre,
          grupo: d.estacion.tipo === "oficial" ? "Estaciones oficiales" : "Estaciones",
          lat: d.estacion.lat,
          lon: d.estacion.lon,
          altitud: d.estacion.altitud,
        })),
        ...(cuenta?.ubicaciones ?? []).map((u) => ({ clave: `u:${u.id}`, nombre: u.nombre, grupo: "Mis lugares", lat: u.lat, lon: u.lon, altitud: u.altitud })),
      ]
    : [];

  let pagina;
  switch (ruta.pagina) {
    case "red":
      pagina = <Red red={red} prevision={prevision} />;
      break;
    case "estaciones":
      pagina = <Estaciones red={red} />;
      break;
    case "estacion":
      pagina = <Estacion key={ruta.param} slug={ruta.param!} prevision={prevision} />;
      break;
    case "horas":
      pagina = red ? <PorHoras lugares={lugares} clave={ruta.query.get("lugar")} /> : <Cargando />;
      break;
    case "dias":
      pagina = red ? <Dias lugares={lugares} clave={ruta.query.get("lugar")} /> : <Cargando />;
      break;
    case "radar":
      pagina = red ? <Radar red={red} /> : <Cargando />;
      break;
    case "satelite":
      pagina = red ? <Satelite red={red} /> : <Cargando />;
      break;
    case "rios":
      pagina = <Rios />;
      break;
    case "rio":
      pagina = <RioDetalle key={ruta.param} slug={ruta.param!} />;
      break;
    case "embalses":
      pagina = <Embalses />;
      break;
    case "embalse":
      pagina = <EmbalseDetalle key={ruta.param} slug={ruta.param!} />;
      break;
    case "fuentes":
      pagina = <Fuentes />;
      break;
    case "entrar":
      pagina = <Entrar />;
      break;
    case "registro":
      pagina = <Registro codigo={ruta.query.get("codigo") ?? ""} />;
      break;
    case "primeros-pasos":
      pagina = <PrimerosPasos />;
      break;
    case "cuenta":
      pagina = <Cuenta />;
      break;
    case "editar-estacion":
      pagina = <EditorEstacion key={ruta.param} id={ruta.param!} />;
      break;
    case "admin":
      pagina = <Admin />;
      break;
    default:
      pagina = (
        <p className="vacio">
          Esta página no existe. <a href="/">Volver a la portada</a>
        </p>
      );
  }

  return (
    <Sesion.Provider value={sesion}>
      <TemaContexto.Provider value={tema}>
        <Cabecera ruta={ruta} principal={red?.estaciones.find((d) => d.estacion.slug === red.porDefecto[0])?.estacion ?? null} />
        <main className="contenido">{pagina}</main>
        <Pie red={red} usuario={sesion.usuario} />
      </TemaContexto.Provider>
    </Sesion.Provider>
  );
}
