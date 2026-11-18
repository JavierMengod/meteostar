// Administración: invitaciones, usuarios y todas las estaciones (incluidas las oficiales).
import { lazy, Suspense, useEffect, useState } from "react";
import type { EmbalseCatalogo, EstacionPropia, Invitacion, RespuestaEmbalses } from "../../shared/tipos";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import { enviar, navegar, usePeticion, useSesion } from "../datos";
import { fechaCorta, fechaDe } from "../formato";
import { Campo } from "./Acceso";
import { FilaEstacionPropia } from "./Cuenta";
import GestionRios from "./GestionRios";

const GestionExternas = lazy(() => import("./GestionExternas"));

interface ResumenAdmin {
  usuarios: { id: number; nombre: string; email: string; rol: string; creado: number; estaciones: number }[];
  invitaciones: Invitacion[];
  estaciones: EstacionPropia[];
}

export default function Admin() {
  const sesion = useSesion();
  const { datos, error, recargar } = usePeticion<ResumenAdmin>(sesion.usuario?.rol === "admin" ? "/api/admin/resumen" : null, 60_000);
  useEffect(() => {
    if (sesion.cargada && sesion.usuario?.rol !== "admin") navegar(sesion.usuario ? "/cuenta" : "/entrar", true);
  }, [sesion.cargada, sesion.usuario]);
  if (!datos) return <Cargando error={error} />;
  const ahora = Math.floor(Date.now() / 1000);
  const particulares = datos.estaciones.filter((e) => e.tipo === "particular");
  const oficiales = datos.estaciones.filter((e) => e.tipo === "oficial");
  const externas = datos.estaciones.filter((e) => e.tipo === "externa");

  return (
    <>
      <div className="titulo-pagina">
        <h1>Administración</h1>
        <p className="suave">
          {datos.usuarios.length} usuarios · {particulares.length} estaciones particulares · {oficiales.length} oficiales · {externas.length} de otras redes
        </p>
      </div>

      <CabeceraSeccion titulo="Invitar a alguien" nota="Meteostar funciona solo por invitación" />
      <NuevaInvitacion recargar={recargar} />
      {datos.invitaciones.length > 0 && (
        <div className="tarjeta tabla-simple">
          {datos.invitaciones.map((i) => (
            <Invitacion key={i.codigo} i={i} ahora={ahora} recargar={recargar} />
          ))}
        </div>
      )}

      <CabeceraSeccion titulo="Estaciones oficiales" nota={<a href="/cuenta/estacion/nueva?oficial=1" className="boton-principal pequeno">+ Añadir oficial</a>} />
      <div className="tarjeta">
        {oficiales.length ? oficiales.map((e) => <FilaEstacionPropia key={e.id} e={e} ahora={ahora} />) : <p className="vacio">Ninguna todavía. Puedes añadir estaciones de AEMET con su indicativo.</p>}
      </div>

      <CabeceraSeccion titulo="Estaciones particulares" />
      <div className="tarjeta">{particulares.length ? particulares.map((e) => <FilaEstacionPropia key={e.id} e={e} ahora={ahora} />) : <p className="vacio">Ninguna.</p>}</div>

      <CabeceraSeccion id="otras-redes" titulo="Estaciones de otras redes" nota="Meteoclimatic: pulsa una estación del mapa para añadirla a Meteostar o quitarla" />
      <Suspense fallback={<div className="tarjeta" style={{ minHeight: 480 }} />}>
        <GestionExternas />
      </Suspense>

      <CabeceraSeccion id="embalses" titulo="Embalses" nota="Los que se muestran en la página Embalses (como mucho 20). «Por defecto»: los que ve destacados quien no tiene cuenta." />
      <GestionEmbalses />

      <CabeceraSeccion id="rios" titulo="Ríos" nota="Aforos de cualquier cuenca que gestiona el Estado. «Por defecto»: los que ve destacados quien no tiene cuenta." />
      <GestionRios />

      <CabeceraSeccion titulo="Usuarios" />
      <div className="tarjeta tabla-simple">
        {datos.usuarios.map((u) => (
          <div key={u.id} className="fila-propia">
            <div>
              <b>
                {u.nombre} {u.rol === "admin" && <span className="insignia">Admin</span>}
              </b>
              <small>
                {u.email} · desde el {fechaCorta(fechaDe(u.creado), true)} · {u.estaciones} {u.estaciones === 1 ? "estación" : "estaciones"}
              </small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function NuevaInvitacion({ recargar }: { recargar: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [nota, setNota] = useState("");
  const [enlace, setEnlace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const crear = async () => {
    setError(null);
    try {
      const r = await enviar<{ codigo: string }>("/api/admin/invitaciones", "POST", { email, nota, dias: 14 });
      setEnlace(`${location.origin}/registro?codigo=${r.codigo}`);
      setEmail("");
      setNota("");
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="tarjeta">
      <div className="fila-campos">
        <Campo etiqueta="Para quién (nota)" ayuda="Solo la ves tú">
          <input value={nota} maxLength={120} placeholder="Juan, estación de Cella" onChange={(e) => setNota(e.target.value)} />
        </Campo>
        <Campo etiqueta="Email (opcional)" ayuda="Si lo pones, solo valdrá para ese email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
      </div>
      <button className="boton-principal" onClick={crear}>
        Crear invitación
      </button>
      {error && <p className="error-form">{error}</p>}
      {enlace && (
        <div className="enlace-invitacion">
          <p>Envía este enlace a la persona invitada (caduca en 14 días y sirve una sola vez):</p>
          <code>{enlace}</code>
          <button className="boton-mini" onClick={() => navigator.clipboard?.writeText(enlace)}>
            Copiar
          </button>
        </div>
      )}
    </section>
  );
}

function Invitacion({ i, ahora, recargar }: { i: Invitacion; ahora: number; recargar: () => Promise<void> }) {
  const estado = i.usada ? `Usada por ${i.usada_por_nombre ?? "—"}` : i.caduca < ahora ? "Caducada" : `Pendiente · caduca el ${fechaCorta(fechaDe(i.caduca))}`;
  const borrar = async () => {
    await enviar(`/api/admin/invitaciones/${i.codigo}`, "DELETE");
    await recargar();
  };
  return (
    <div className="fila-propia">
      <div>
        <b>{i.nota || i.email || "Invitación"}</b>
        <small>
          {i.email && `${i.email} · `}
          {estado}
        </small>
      </div>
      {!i.usada && (
        <div className="acciones">
          <button className="boton-mini" onClick={() => navigator.clipboard?.writeText(`${location.origin}/registro?codigo=${i.codigo}`)}>
            Copiar enlace
          </button>
          <button className="boton-mini peligro" onClick={borrar}>
            Anular
          </button>
        </div>
      )}
    </div>
  );
}

function GestionEmbalses() {
  const { datos: elegidos, recargar } = usePeticion<RespuestaEmbalses>("/api/embalses", 0);
  const [catalogo, setCatalogo] = useState<EmbalseCatalogo[] | null>(null);
  const [busca, setBusca] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lista = elegidos?.embalses ?? [];

  // Si se llega desde «+ Añadir embalse» de la página de embalses, se abre el buscador y se baja hasta él
  useEffect(() => {
    if (location.hash !== "#embalses") return;
    abrirCatalogo();
    setTimeout(() => document.getElementById("embalses")?.scrollIntoView({ behavior: "smooth" }), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirCatalogo = async () => {
    setError(null);
    try {
      const r = await fetch("/api/admin/embalses/catalogo");
      if (!r.ok) throw new Error("No se ha podido cargar el catálogo");
      setCatalogo(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const accion = async (f: () => Promise<unknown>) => {
    setError(null);
    try {
      await f();
      await recargar();
      if (catalogo) await abrirCatalogo();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const mover = (i: number, d: number) =>
    accion(() => {
      const slugs = lista.map((e) => e.slug);
      [slugs[i], slugs[i + d]] = [slugs[i + d], slugs[i]];
      return enviar("/api/admin/embalses/orden", "PUT", { slugs });
    });
  const q = busca.trim().toLowerCase();
  const resultados = catalogo && q.length >= 2
    ? catalogo.filter((e) => `${e.nombre} ${e.provincia} ${e.cuenca}`.toLowerCase().includes(q)).slice(0, 12)
    : [];

  return (
    <section className="tarjeta">
      {lista.map((e, i) => (
        <div key={e.slug} className="fila-propia">
          <div>
            <b>{e.nombre}</b>
            <small>
              {e.provincia} · cuenca del {e.cuenca} · {e.capacidad ?? "—"} hm³
            </small>
          </div>
          <div className="acciones">
            <button className="boton-mini" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">
              ↑
            </button>
            <button className="boton-mini" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar">
              ↓
            </button>
            <button
              className={`boton-mini ${elegidos?.porDefecto.includes(e.slug) ? "marcado" : ""}`}
              aria-pressed={!!elegidos?.porDefecto.includes(e.slug)}
              title="Se ve destacado para quien no tiene cuenta"
              onClick={() => accion(() => enviar("/api/admin/por-defecto", "PUT", { tipo: "embalse", slug: e.slug, destacado: !elegidos?.porDefecto.includes(e.slug) }))}
            >
              {elegidos?.porDefecto.includes(e.slug) ? "★ Por defecto" : "☆ Por defecto"}
            </button>
            <button className="boton-mini peligro" onClick={() => accion(() => enviar(`/api/admin/embalses/${e.slug}`, "DELETE"))}>
              Quitar
            </button>
          </div>
        </div>
      ))}
      {catalogo ? (
        <div className="buscador-embalses">
          <Campo etiqueta="Añadir embalse" ayuda="Busca por nombre, provincia o cuenca">
            <input value={busca} placeholder="Escribe al menos 2 letras…" onChange={(e) => setBusca(e.target.value)} />
          </Campo>
          {resultados.map((e) => (
            <div key={e.slug} className="fila-propia">
              <div>
                <b>{e.nombre}</b>
                <small>
                  {e.provincia} · {e.cuenca} · {e.capacidad ?? "—"} hm³{e.porcentaje !== null && ` · ${e.porcentaje} %`}
                </small>
              </div>
              {e.elegido ? (
                <span className="insignia gris">Ya está</span>
              ) : (
                <button className="boton-mini" onClick={() => accion(() => enviar("/api/admin/embalses", "POST", { slug: e.slug }))}>
                  Añadir
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <button className="boton-secundario" onClick={abrirCatalogo}>
          + Añadir embalse
        </button>
      )}
      {error && <p className="error-form">{error}</p>}
    </section>
  );
}
