import { useEffect, useRef, useState } from "react";
import type { Estacion } from "../../shared/tipos";
import { enviar, navegar, useSesion, type Ruta } from "../datos";
import { IGLESIA } from "./iglesia";

interface Enlace {
  href: string;
  nombre: string;
  detalle?: string;
  activo: (r: Ruta) => boolean;
  /** Opción de acción (se separa de la lista) */
  accion?: boolean;
}

interface Menu {
  nombre: string;
  enlaces: Enlace[];
}

export function Logo() {
  return (
    // Sello: la iglesia de Villastar bajo la estrella de Meteostar
    <svg className="logo" viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="16" />
      <g className="logo-estrella">
        <path d="M26 16L28 24L36 26L28 28L26 36L24 28L16 26L24 24Z" />
        <svg x="20" y="14" width="70.9" height="86" viewBox="0 0 1762 2137">
          <path fillRule="evenodd" d={IGLESIA} />
        </svg>
      </g>
    </svg>
  );
}

export default function Cabecera({ ruta, estaciones }: { ruta: Ruta; estaciones: Estacion[] }) {
  const sesion = useSesion();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [movil, setMovil] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Cerrar menús al navegar o al pulsar fuera
  useEffect(() => {
    setAbierto(null);
    setMovil(false);
  }, [ruta]);
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(null);
    };
    document.addEventListener("click", fuera);
    return () => document.removeEventListener("click", fuera);
  }, []);

  const particulares = estaciones.filter((e) => e.tipo === "particular");
  const oficiales = estaciones.filter((e) => e.tipo === "oficial");
  const enlaceEstacion = (e: Estacion): Enlace => ({
    href: `/estacion/${e.slug}`,
    nombre: e.nombre,
    detalle: e.tipo === "oficial" ? `${e.red ?? "Oficial"} · ${e.municipio}` : `${e.municipio} · ${e.altitud} m`,
    activo: (r) => r.pagina === "estacion" && r.param === e.slug,
  });

  const menu: (Enlace | Menu)[] = [
    { href: "/", nombre: "Principal", activo: (r) => r.pagina === "red" },
    {
      nombre: "Estaciones",
      enlaces: [
        ...[...particulares, ...oficiales].map(enlaceEstacion),
        sesion.usuario
          ? {
              href: "/cuenta/estacion/nueva",
              nombre: "+ Añadir tu estación",
              detalle: "Súmala a la red",
              activo: (r: Ruta) => r.pagina === "editar-estacion" && r.param === "nueva",
              accion: true,
            }
          : { href: "/entrar", nombre: "¿Tienes una estación?", detalle: "Entra con tu cuenta para añadirla", activo: () => false, accion: true },
      ],
    },
    {
      nombre: "Previsión",
      enlaces: [
        { href: "/prevision", nombre: "Por horas", detalle: "Las próximas 48 horas", activo: (r) => r.pagina === "horas" },
        { href: "/prevision/14-dias", nombre: "14 días", detalle: "Con la probabilidad de precipitación", activo: (r) => r.pagina === "dias" },
      ],
    },
    {
      nombre: "Seguimiento",
      enlaces: [
        { href: "/radar", nombre: "Radar", detalle: "Precipitación en tiempo real", activo: (r) => r.pagina === "radar" },
        { href: "/satelite", nombre: "Satélite", detalle: "Nubes vistas desde el espacio", activo: (r) => r.pagina === "satelite" },
      ],
    },
    {
      nombre: "Hidrología",
      enlaces: [
        { href: "/rios", nombre: "Ríos", detalle: "Caudal medido y previsión", activo: (r) => r.pagina === "rios" || r.pagina === "rio" },
        { href: "/embalses", nombre: "Embalses", detalle: "Cuánta agua guardan", activo: (r) => r.pagina === "embalses" || r.pagina === "embalse" },
      ],
    },
  ];

  const usuario = sesion.usuario;
  const salir = async () => {
    await enviar("/api/auth/salir", "POST");
    await sesion.recargar();
    navegar("/");
  };

  return (
    <header className="cabecera" ref={ref}>
      <div className="cabecera-dentro">
        <a href="/" className="marca">
          <Logo />
          <span>
            Meteo<b>star</b>
          </span>
        </a>

        <nav className={movil ? "nav abierta" : "nav"} aria-label="Principal">
          {menu.map((m) =>
            "href" in m ? (
              <a key={m.href} href={m.href} className={m.activo(ruta) ? "nav-item activo" : "nav-item"}>
                {m.nombre}
              </a>
            ) : m.enlaces.length ? (
              <div key={m.nombre} className="desplegable">
                <button
                  className={m.enlaces.some((e) => e.activo(ruta)) ? "nav-item activo" : "nav-item"}
                  aria-expanded={abierto === m.nombre}
                  onClick={() => setAbierto(abierto === m.nombre ? null : m.nombre)}
                >
                  {m.nombre} <span className="flecha">⌄</span>
                </button>
                {abierto === m.nombre && (
                  <div className="submenu">
                    {m.enlaces.map((e) => (
                      <a key={e.href} href={e.href} className={[e.activo(ruta) ? "activo" : "", e.accion ? "accion" : ""].join(" ").trim()}>
                        <b>{e.nombre}</b>
                        {e.detalle && <small>{e.detalle}</small>}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : null,
          )}
        </nav>

        <div className="cabecera-acciones">
          {sesion.cargada &&
            (usuario ? (
              <div className="desplegable">
                <button className="boton-usuario" aria-expanded={abierto === "usuario"} onClick={() => setAbierto(abierto === "usuario" ? null : "usuario")}>
                  <span className="avatar">{usuario.nombre.charAt(0).toUpperCase()}</span>
                  <span className="nombre-usuario">{usuario.nombre}</span>
                </button>
                {abierto === "usuario" && (
                  <div className="submenu derecha">
                    <a href="/cuenta">
                      <b>Mi cuenta</b>
                      <small>Mis estaciones y lugares</small>
                    </a>
                    <a href="/cuenta/estacion/nueva">
                      <b>Añadir estación</b>
                    </a>
                    {usuario.rol === "admin" && (
                      <a href="/admin">
                        <b>Administración</b>
                        <small>Invitaciones, usuarios y estaciones</small>
                      </a>
                    )}
                    <button onClick={salir}>
                      <b>Salir</b>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <a href="/entrar" className="boton-entrar">
                Entrar
              </a>
            ))}
          <button className="hamburguesa" aria-label="Menú" aria-expanded={movil} onClick={() => setMovil(!movil)}>
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
