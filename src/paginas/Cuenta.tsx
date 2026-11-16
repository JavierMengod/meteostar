// Mi cuenta: mis estaciones (con su estado), mis lugares para la previsión y mi perfil.
import { lazy, Suspense, useEffect, useState } from "react";
import type { EstacionPropia, RespuestaCuenta, Ubicacion } from "../../shared/tipos";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import type { Punto } from "../componentes/SelectorMapa";
import { TEMAS, type Tema } from "../../shared/temas";
import { enviar, navegar, usePeticion, useSesion, useTemaActual } from "../datos";
import { hace, hora } from "../formato";
import { Campo } from "./Acceso";

const SelectorMapa = lazy(() => import("../componentes/SelectorMapa"));

const NOMBRE_FUENTE: Record<string, string> = {
  directo: "Envío directo",
  ecowitt_api: "ecowitt.net",
  wunderground: "Weather Underground",
  meteoclimatic: "Meteoclimatic",
  aemet: "AEMET",
};

/** Estado de una estación según su última lectura. */
export function EstadoEstacion({ e, ahora }: { e: EstacionPropia; ahora: number }) {
  if (!e.activa) return <span className="estado-punto apagado">Desactivada</span>;
  if (e.ultimo_error) return <span className="estado-punto error" title={e.ultimo_error}>Error: {e.ultimo_error}</span>;
  if (!e.ultima) return <span className="estado-punto espera">Esperando datos</span>;
  const margen = e.fuente === "aemet" ? 7200 : e.fuente === "meteoclimatic" ? 2400 : 900;
  const vieja = ahora - e.ultima > margen;
  return (
    <span className={vieja ? "estado-punto espera" : "estado-punto ok"}>
      {vieja ? "Sin datos recientes" : "En directo"} · última {hace(ahora - e.ultima)} ({hora(e.ultima)})
    </span>
  );
}

export function FilaEstacionPropia({ e, ahora }: { e: EstacionPropia; ahora: number }) {
  return (
    <div className="fila-propia">
      <div>
        <b>
          {e.nombre} {e.tipo === "oficial" && <span className="insignia">{e.red ?? "Oficial"}</span>}
          {!e.publica && <span className="insignia gris">Privada</span>}
        </b>
        <small>
          {e.municipio} · {e.altitud} m · {NOMBRE_FUENTE[e.fuente] ?? e.fuente}
          {e.propietario && ` · ${e.propietario}`}
        </small>
        <EstadoEstacion e={e} ahora={ahora} />
      </div>
      <div className="acciones">
        <a href={`/estacion/${e.slug}`} className="boton-secundario">
          Ver
        </a>
        <a href={`/cuenta/estacion/${e.id}`} className="boton-secundario">
          Editar
        </a>
      </div>
    </div>
  );
}

export default function Cuenta() {
  const sesion = useSesion();
  const { datos: c, error, recargar } = usePeticion<RespuestaCuenta>(sesion.usuario ? "/api/cuenta" : null, 60_000);
  useEffect(() => {
    if (sesion.cargada && !sesion.usuario) navegar("/entrar", true);
  }, [sesion.cargada, sesion.usuario]);
  // Ir a la sección de lugares si se llega con /cuenta#lugares
  useEffect(() => {
    if (c && location.hash === "#lugares") document.getElementById("lugares")?.scrollIntoView();
  }, [c]);
  if (!c) return <Cargando error={error} />;
  const ahora = Math.floor(Date.now() / 1000);

  return (
    <>
      <div className="titulo-pagina">
        <h1>Hola, {c.usuario.nombre}</h1>
        <p className="suave">{c.usuario.email}</p>
      </div>

      <CabeceraSeccion titulo="Mis estaciones" nota={<a href="/cuenta/estacion/nueva" className="boton-principal pequeno">+ Añadir estación</a>} />
      <div className="tarjeta">
        {c.estaciones.length ? (
          c.estaciones.map((e) => <FilaEstacionPropia key={e.id} e={e} ahora={ahora} />)
        ) : (
          <p className="vacio">
            Todavía no tienes estaciones. <a href="/cuenta/estacion/nueva">Añade la primera</a>.
          </p>
        )}
      </div>

      <CabeceraSeccion id="lugares" titulo="Mis lugares" nota="Sitios de los que quieres ver la previsión aunque no haya estación" />
      <Lugares ubicaciones={c.ubicaciones} recargar={recargar} />

      <CabeceraSeccion titulo="Mi perfil" />
      <SelectorTema />
      <Perfil nombre={c.usuario.nombre} recargar={async () => (await recargar(), await sesion.recargar())} />
    </>
  );
}

function Lugares({ ubicaciones, recargar }: { ubicaciones: Ubicacion[]; recargar: () => Promise<void> }) {
  const [editando, setEditando] = useState<(Punto & { id?: number; nombre: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    if (!editando) return;
    setError(null);
    try {
      if (editando.id) await enviar(`/api/cuenta/ubicaciones/${editando.id}`, "PUT", editando);
      else await enviar("/api/cuenta/ubicaciones", "POST", editando);
      setEditando(null);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const borrar = async (u: Ubicacion) => {
    if (!confirm(`¿Borrar «${u.nombre}»?`)) return;
    await enviar(`/api/cuenta/ubicaciones/${u.id}`, "DELETE");
    await recargar();
  };
  return (
    <div className="tarjeta">
      {ubicaciones.map((u) => (
        <div key={u.id} className="fila-propia">
          <div>
            <b>{u.nombre}</b>
            <small className="mono">
              {u.lat.toFixed(4)}, {u.lon.toFixed(4)} · {u.altitud} m
            </small>
          </div>
          <div className="acciones">
            <a href={`/prevision?lugar=u:${u.id}`} className="boton-secundario">
              Previsión
            </a>
            <button className="boton-secundario" onClick={() => setEditando({ ...u })}>
              Editar
            </button>
            <button className="boton-secundario peligro" onClick={() => borrar(u)}>
              Borrar
            </button>
          </div>
        </div>
      ))}
      {!ubicaciones.length && !editando && <p className="vacio">No tienes lugares guardados.</p>}
      {editando ? (
        <div className="editor-lugar">
          <Campo etiqueta="Nombre del lugar">
            <input value={editando.nombre} maxLength={60} placeholder="Por ejemplo: Huerto de Cubla" onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
          </Campo>
          <Suspense fallback={<div className="mapa" style={{ height: 340 }} />}>
            <SelectorMapa punto={editando} cambiar={(p) => setEditando({ ...editando, ...p })} />
          </Suspense>
          {error && <p className="error-form">{error}</p>}
          <div className="acciones">
            <button className="boton-principal" onClick={guardar}>
              Guardar lugar
            </button>
            <button className="boton-secundario" onClick={() => setEditando(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button className="boton-secundario" onClick={() => setEditando({ nombre: "", lat: 40.284, lon: -1.158, altitud: 935 })}>
          + Añadir lugar
        </button>
      )}
    </div>
  );
}

function Perfil({ nombre: inicial, recargar }: { nombre: string; recargar: () => Promise<unknown> }) {
  const [nombre, setNombre] = useState(inicial);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const ejecutar = async (f: () => Promise<unknown>, ok: string) => {
    setMensaje(null);
    try {
      await f();
      setMensaje({ ok: true, texto: ok });
      await recargar();
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <div className="rejilla-2">
      <form
        className="tarjeta formulario-simple"
        onSubmit={(e) => {
          e.preventDefault();
          ejecutar(() => enviar("/api/cuenta/perfil", "PUT", { nombre }), "Nombre guardado");
        }}
      >
        <Campo etiqueta="Nombre">
          <input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <button className="boton-secundario">Guardar nombre</button>
      </form>
      <form
        className="tarjeta formulario-simple"
        onSubmit={(e) => {
          e.preventDefault();
          ejecutar(async () => {
            await enviar("/api/cuenta/contrasena", "PUT", { actual, nueva });
            setActual("");
            setNueva("");
          }, "Contraseña cambiada. Se han cerrado tus otras sesiones.");
        }}
      >
        <Campo etiqueta="Contraseña actual">
          <input type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
        </Campo>
        <Campo etiqueta="Nueva contraseña" ayuda="Al menos 10 caracteres">
          <input type="password" autoComplete="new-password" minLength={10} value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </Campo>
        <button className="boton-secundario">Cambiar contraseña</button>
      </form>
      {mensaje && <p className={mensaje.ok ? "ok-form" : "error-form"}>{mensaje.texto}</p>}
    </div>
  );
}

function SelectorTema() {
  const { tema, poner } = useTemaActual();
  const [error, setError] = useState<string | null>(null);
  const elegir = async (t: Tema) => {
    setError(null);
    try {
      await poner(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="tarjeta selector-tema">
      <div>
        <h3>Tema de la web</h3>
        <p className="suave pequeno">Se guarda en tu cuenta: lo verás igual en el móvil, el ordenador o la tableta.</p>
      </div>
      <div className="opciones-tema" role="radiogroup" aria-label="Tema">
        {TEMAS.map((t) => (
          <button key={t.id} role="radio" aria-checked={tema === t.id} className={tema === t.id ? "opcion-tema elegida" : "opcion-tema"} onClick={() => elegir(t.id)}>
            <span
              className="muestra-tema"
              aria-hidden="true"
              style={{ background: `linear-gradient(135deg, ${t.muestra[0]} 50%, ${t.muestra[1]} 50%)` }}
            >
              <i style={{ background: t.muestra[2] }} />
            </span>
            <b>{t.nombre}</b>
            <small>{t.detalle}</small>
          </button>
        ))}
      </div>
      {error && <p className="error-form">{error}</p>}
    </section>
  );
}
