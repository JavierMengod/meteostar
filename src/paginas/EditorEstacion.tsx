// Alta y edición de una estación: 1) dónde está (mapa), 2) qué es, 3) de dónde vienen los datos.
import { lazy, Suspense, useEffect, useState } from "react";
import type { EstacionPropia, InfoConector, RespuestaCuenta } from "../../shared/tipos";
import { CabeceraSeccion, Cargando } from "../componentes/Piezas";
import { enviar, navegar, usePeticion, useSesion } from "../datos";
import { hora, n } from "../formato";
import { Campo } from "./Acceso";
import { EstadoEstacion } from "./Cuenta";

const SelectorMapa = lazy(() => import("../componentes/SelectorMapa"));

interface Formulario {
  nombre: string;
  municipio: string;
  provincia: string;
  lat: number;
  lon: number;
  altitud: number;
  descripcion: string;
  equipo: string;
  meteoclimatic: string;
  fuente: string;
  config: Record<string, string>;
  publica: boolean;
  activa: boolean;
  tipo: "particular" | "oficial";
  red: string;
}

const VACIO: Formulario = {
  nombre: "",
  municipio: "",
  provincia: "Teruel",
  lat: 40.284,
  lon: -1.158,
  altitud: 935,
  descripcion: "",
  equipo: "",
  meteoclimatic: "",
  fuente: "directo",
  config: {},
  publica: true,
  activa: true,
  tipo: "particular",
  red: "",
};

const deEstacion = (e: EstacionPropia): Formulario => ({
  nombre: e.nombre,
  municipio: e.municipio,
  provincia: e.provincia,
  lat: e.lat,
  lon: e.lon,
  altitud: e.altitud,
  descripcion: e.descripcion ?? "",
  equipo: e.equipo ?? "",
  meteoclimatic: e.meteoclimatic ?? "",
  fuente: e.fuente,
  config: e.config,
  publica: e.publica,
  activa: e.activa,
  tipo: e.tipo,
  red: e.red ?? "",
});

export default function EditorEstacion({ id }: { id: string }) {
  const sesion = useSesion();
  const nueva = id === "nueva";
  const esAdmin = sesion.usuario?.rol === "admin";
  const { datos: conectores } = usePeticion<InfoConector[]>("/api/conectores", 0);
  const { datos: cuenta } = usePeticion<RespuestaCuenta>(sesion.usuario && !nueva ? "/api/cuenta" : null, 0);
  // El administrador puede editar estaciones de otros
  const { datos: admin } = usePeticion<{ estaciones: EstacionPropia[] }>(esAdmin && !nueva ? "/api/admin/resumen" : null, 0);
  const [estacion, setEstacion] = useState<EstacionPropia | null>(null);
  const [f, setF] = useState<Formulario | null>(nueva ? { ...VACIO, tipo: new URLSearchParams(location.search).get("oficial") ? "oficial" : "particular" } : null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (sesion.cargada && !sesion.usuario) navegar("/entrar", true);
  }, [sesion.cargada, sesion.usuario]);

  useEffect(() => {
    if (nueva || f) return;
    const e = cuenta?.estaciones.find((x) => String(x.id) === id) ?? admin?.estaciones.find((x) => String(x.id) === id);
    if (e) {
      setEstacion(e);
      setF(deEstacion(e));
    }
  }, [cuenta, admin, id, nueva, f]);

  if (!f || !conectores) return <Cargando />;
  const disponibles = conectores.filter((c) => !c.soloAdmin || esAdmin);
  const con = conectores.find((c) => c.id === f.fuente);
  const poner = (cambios: Partial<Formulario>) => setF({ ...f, ...cambios });

  const guardar = async () => {
    setError(null);
    setOcupado(true);
    try {
      const datos = { ...f, config: f.config };
      const r = nueva
        ? await enviar<EstacionPropia>("/api/cuenta/estaciones", "POST", datos)
        : await enviar<EstacionPropia>(`/api/cuenta/estaciones/${id}`, "PUT", datos);
      setEstacion(r);
      setF(deEstacion(r));
      if (nueva) navegar(`/cuenta/estacion/${r.id}?creada=1`, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const probar = async () => {
    setPrueba({ ok: true, texto: "Leyendo la estación…" });
    type Prueba = { ok: boolean; error?: string; nuevas?: number; ultima?: { ts: number; temp: number | null } };
    const r: Prueba = await enviar<Prueba>(`/api/cuenta/estaciones/${id}/probar`, "POST").catch((e) => ({ ok: false, error: String(e.message) }));
    setPrueba(
      r.ok
        ? { ok: true, texto: `Funciona. Última lectura de las ${r.ultima ? hora(r.ultima.ts) : "—"}: ${n(r.ultima?.temp)} °C.` }
        : { ok: false, texto: r.error ?? "No se ha podido leer la estación" },
    );
  };

  const nuevaClave = async () => {
    if (!confirm("La clave actual dejará de funcionar y tendrás que cambiarla en la consola. ¿Seguro?")) return;
    const r = await enviar<EstacionPropia>(`/api/cuenta/estaciones/${id}/token`, "POST");
    setEstacion(r);
  };

  const borrar = async () => {
    if (!estacion || !confirm(`¿Eliminar «${estacion.nombre}» y todos sus datos? No se puede deshacer.`)) return;
    await enviar(`/api/cuenta/estaciones/${id}`, "DELETE");
    navegar(esAdmin && estacion.propietario !== sesion.usuario?.nombre ? "/admin" : "/cuenta");
  };

  return (
    <>
      <div className="titulo-pagina">
        <a href="/cuenta" className="pequeno">
          ‹ Mi cuenta
        </a>
        <h1>{nueva ? (f.tipo === "oficial" ? "Nueva estación oficial" : "Añadir estación") : f.nombre || "Estación"}</h1>
        {estacion && <EstadoEstacion e={estacion} ahora={Math.floor(Date.now() / 1000)} />}
      </div>

      {estacion?.fuente === "directo" && estacion.token && <InstruccionesEnvio token={estacion.token} nuevaClave={nuevaClave} recienCreada={new URLSearchParams(location.search).has("creada")} />}

      <CabeceraSeccion titulo="1. Dónde está" nota="Sitúala con precisión: la altitud y las coordenadas se usan en la previsión y en el mapa" />
      <section className="tarjeta">
        <Suspense fallback={<div className="mapa" style={{ height: 340 }} />}>
          <SelectorMapa punto={f} cambiar={(p) => poner(p)} />
        </Suspense>
        <div className="fila-campos">
          <Campo etiqueta="Municipio">
            <input value={f.municipio} maxLength={60} onChange={(e) => poner({ municipio: e.target.value })} />
          </Campo>
          <Campo etiqueta="Provincia">
            <input value={f.provincia} maxLength={40} onChange={(e) => poner({ provincia: e.target.value })} />
          </Campo>
        </div>
      </section>

      <CabeceraSeccion titulo="2. La estación" />
      <section className="tarjeta">
        <div className="fila-campos">
          <Campo etiqueta="Nombre" ayuda="Como aparecerá en la web, p. ej. «Villastar - Vega»">
            <input value={f.nombre} maxLength={60} onChange={(e) => poner({ nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Equipo" ayuda="Consola y sensores">
            <input value={f.equipo} maxLength={120} placeholder="Ecowitt HP2560 + WS69" onChange={(e) => poner({ equipo: e.target.value })} />
          </Campo>
          <Campo etiqueta="Código en Meteoclimatic" ayuda="Opcional, si también publica allí">
            <input value={f.meteoclimatic} maxLength={30} placeholder="ESARA44…" onChange={(e) => poner({ meteoclimatic: e.target.value })} />
          </Campo>
        </div>
        <Campo etiqueta="Descripción del emplazamiento" ayuda="Opcional: dónde está instalada, a qué altura, alrededores…">
          <textarea rows={3} maxLength={600} value={f.descripcion} onChange={(e) => poner({ descripcion: e.target.value })} />
        </Campo>
        {esAdmin && (
          <div className="fila-campos">
            <Campo etiqueta="Tipo">
              <select value={f.tipo} onChange={(e) => poner({ tipo: e.target.value as Formulario["tipo"] })}>
                <option value="particular">Particular</option>
                <option value="oficial">Oficial</option>
              </select>
            </Campo>
            {f.tipo === "oficial" && (
              <Campo etiqueta="Red oficial">
                <input value={f.red} maxLength={40} placeholder="AEMET" onChange={(e) => poner({ red: e.target.value })} />
              </Campo>
            )}
          </div>
        )}
        <div className="casillas-check">
          <label>
            <input type="checkbox" checked={f.publica} onChange={(e) => poner({ publica: e.target.checked })} /> Mostrarla en la web (si no, solo la ves tú)
          </label>
          {!nueva && (
            <label>
              <input type="checkbox" checked={f.activa} onChange={(e) => poner({ activa: e.target.checked })} /> Activa (recibe y lee datos)
            </label>
          )}
        </div>
      </section>

      <CabeceraSeccion titulo="3. De dónde vienen los datos" />
      <div className="opciones-fuente">
        {disponibles.map((c) => (
          <button key={c.id} type="button" className={f.fuente === c.id ? "opcion-fuente elegida" : "opcion-fuente"} onClick={() => poner({ fuente: c.id, config: c.id === f.fuente ? f.config : {} })}>
            <b>{c.nombre}</b>
            <small>{c.descripcion}</small>
            <span className="insignia gris">{c.modo === "envio" ? "La estación envía" : `Cada ${c.intervalo} min`}</span>
          </button>
        ))}
      </div>
      {con && con.campos.length > 0 && (
        <section className="tarjeta">
          <div className="fila-campos">
            {con.campos.map((campo) => (
              <Campo
                key={campo.nombre}
                etiqueta={`${campo.etiqueta}${campo.obligatorio ? "" : " (opcional)"}`}
                ayuda={[campo.ayuda, campo.ejemplo && `Ej.: ${campo.ejemplo}`].filter(Boolean).join(" · ")}
              >
                <input
                  type={campo.tipo === "secreto" ? "password" : "text"}
                  autoComplete="off"
                  value={f.config[campo.nombre] ?? ""}
                  onChange={(e) => poner({ config: { ...f.config, [campo.nombre]: e.target.value } })}
                />
              </Campo>
            ))}
          </div>
          <p className="suave pequeno">Las claves se guardan cifradas y nunca se muestran en la web.</p>
        </section>
      )}

      {error && <p className="error-form">{error}</p>}
      <div className="barra-guardar">
        <button className="boton-principal" onClick={guardar} disabled={ocupado}>
          {ocupado ? "Guardando…" : nueva ? "Crear estación" : "Guardar cambios"}
        </button>
        {!nueva && con?.modo === "consulta" && (
          <button className="boton-secundario" onClick={probar}>
            Probar ahora
          </button>
        )}
        {!nueva && (
          <button className="boton-secundario peligro" onClick={borrar}>
            Eliminar estación
          </button>
        )}
        {prueba && <span className={prueba.ok ? "ok-form" : "error-form"}>{prueba.texto}</span>}
      </div>
    </>
  );
}

function InstruccionesEnvio({ token, nuevaClave, recienCreada }: { token: string; nuevaClave: () => void; recienCreada: boolean }) {
  const ruta = `/api/ingest/${token}`;
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(ruta);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin portapapeles */
    }
  };
  return (
    <section className={`tarjeta instrucciones ${recienCreada ? "destacada" : ""}`}>
      <h3>{recienCreada ? "¡Estación creada! Ahora configura la consola" : "Configuración de la consola"}</h3>
      <p>
        En la app <b>WS View Plus</b> (o en la web de la consola) ve a <b>Weather Services → Customized</b> y pon:
      </p>
      <dl className="ficha-datos">
        <div>
          <dt>Protocolo</dt>
          <dd>Ecowitt (o Wunderground)</dd>
        </div>
        <div>
          <dt>Servidor</dt>
          <dd className="mono">{location.hostname}</dd>
        </div>
        <div>
          <dt>Ruta (Path)</dt>
          <dd className="mono ruta-envio">
            {ruta}{" "}
            <button className="boton-mini" onClick={copiar}>
              {copiado ? "Copiada" : "Copiar"}
            </button>
          </dd>
        </div>
        <div>
          <dt>Puerto · Intervalo</dt>
          <dd>80 · 60 segundos</dd>
        </div>
      </dl>
      <p className="suave pequeno">
        La ruta lleva la clave secreta de tu estación: no la compartas. Si se filtra, <button className="enlace-boton" onClick={nuevaClave}>genera una nueva</button>.
      </p>
    </section>
  );
}
