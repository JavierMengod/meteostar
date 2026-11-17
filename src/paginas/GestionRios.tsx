// Administración de los ríos (aforos) que se muestran: añadir del catálogo del Observatorio del Agua, editar, ordenar y quitar.
import { useEffect, useState } from "react";
import type { Aforo, AforoCatalogo, RespuestaAforos, RespuestaEmbalses } from "../../shared/tipos";
import { enviar, usePeticion } from "../datos";
import { n } from "../formato";
import { Campo } from "./Acceso";

interface Formulario {
  nombre: string;
  rio: string;
  embalse: string;
  reguladoDesde: string;
}

const vacio = (f?: Partial<Formulario>): Formulario => ({ nombre: "", rio: "", embalse: "", reguladoDesde: "", ...f });
const aCuerpo = (f: Formulario) => ({ nombre: f.nombre.trim(), rio: f.rio.trim(), embalse: f.embalse || null, reguladoDesde: f.reguladoDesde ? Number(f.reguladoDesde) : null });

/** Campos comunes al añadir y al editar un río. */
function CamposRio({ f, set, embalses }: { f: Formulario; set: (f: Formulario) => void; embalses: RespuestaEmbalses | null }) {
  return (
    <div className="campos-rio">
      <Campo etiqueta="Nombre" ayuda="Cómo se verá en la web, p. ej. «Turia en Teruel»">
        <input value={f.nombre} onChange={(e) => set({ ...f, nombre: e.target.value })} required />
      </Campo>
      <Campo etiqueta="Río">
        <input value={f.rio} placeholder="Turia" onChange={(e) => set({ ...f, rio: e.target.value })} required />
      </Campo>
      <Campo etiqueta="Embalse que lo regula" ayuda="Opcional: se muestra junto al río">
        <select value={f.embalse} onChange={(e) => set({ ...f, embalse: e.target.value })}>
          <option value="">Ninguno</option>
          {embalses?.embalses.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Regulado desde (año)" ayuda="Opcional: separa los récords de antes y después del embalse">
        <input type="number" min={1850} max={2100} value={f.reguladoDesde} placeholder="1962" onChange={(e) => set({ ...f, reguladoDesde: e.target.value })} />
      </Campo>
    </div>
  );
}

export default function GestionRios() {
  const { datos, recargar } = usePeticion<RespuestaAforos>("/api/aforos", 0);
  const { datos: embalses } = usePeticion<RespuestaEmbalses>("/api/embalses", 0);
  const [catalogo, setCatalogo] = useState<AforoCatalogo[] | null>(null);
  const [busca, setBusca] = useState("");
  const [elegido, setElegido] = useState<AforoCatalogo | null>(null);
  const [form, setForm] = useState<Formulario>(vacio());
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const lista = datos?.aforos ?? [];
  const porDefecto = datos?.porDefecto ?? [];

  // Si se llega desde «+ Añadir río» de la página de ríos, se abre el buscador y se baja hasta él
  useEffect(() => {
    if (location.hash !== "#rios") return;
    abrirCatalogo();
    setTimeout(() => document.getElementById("rios")?.scrollIntoView({ behavior: "smooth" }), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirCatalogo = async () => {
    setError(null);
    try {
      const r = await fetch("/api/admin/aforos/catalogo");
      if (!r.ok) throw new Error("No se ha podido cargar el catálogo del Observatorio del Agua");
      setCatalogo(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const accion = async (f: () => Promise<unknown>) => {
    setError(null);
    setOcupado(true);
    try {
      await f();
      await recargar();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setOcupado(false);
    }
  };
  const mover = (i: number, d: number) =>
    accion(() => {
      const slugs = lista.map((a) => a.slug);
      [slugs[i], slugs[i + d]] = [slugs[i + d], slugs[i]];
      return enviar("/api/admin/aforos-orden", "PUT", { slugs });
    });
  const empezarEdicion = (a: Aforo) => {
    setEditando(a.slug);
    setForm(vacio({ nombre: a.nombre, rio: a.rio, embalse: a.embalse ?? "", reguladoDesde: a.reguladoDesde ? String(a.reguladoDesde) : "" }));
  };
  const elegir = (c: AforoCatalogo) => {
    setElegido(c);
    // «Río Jiloca en Calamocha» → nombre «Jiloca en Calamocha», río «Jiloca»; «TERUEL» → «Teruel»
    const nombre = c.nombre === c.nombre.toUpperCase() ? c.nombre.toLowerCase().replace(/(^|[\s-])\S/g, (x) => x.toUpperCase()) : c.nombre;
    const m = nombre.match(/^r[ií]o\s+(.+?)\s+en\s+(.+)$/i);
    setForm(vacio(m ? { nombre: `${m[1]} en ${m[2]}`, rio: m[1] } : { nombre }));
  };

  const q = busca.trim().toLowerCase();
  const resultados = catalogo && q.length >= 2 ? catalogo.filter((c) => `${c.nombre} ${c.demarcacion}`.toLowerCase().includes(q)).slice(0, 15) : [];

  return (
    <section className="tarjeta">
      {lista.map((a, i) =>
        editando === a.slug ? (
          <form
            key={a.slug}
            className="editar-rio"
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (await accion(() => enviar(`/api/admin/aforos/${a.slug}`, "PUT", aCuerpo(form)))) setEditando(null);
            }}
          >
            <CamposRio f={form} set={setForm} embalses={embalses ?? null} />
            <div className="acciones">
              <button className="boton" disabled={ocupado}>
                Guardar
              </button>
              <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div key={a.slug} className="fila-propia">
            <div>
              <b>{a.nombre}</b>
              <small>
                Río {a.rio}
                {a.confederacion && ` · ${a.confederacion}`}
                {a.codigo && ` · aforo ${a.codigo}`}
                {a.ultimo?.caudal != null && ` · ahora ${n(a.ultimo.caudal, 2)} m³/s`}
                {a.embalse && ` · regulado por ${embalses?.embalses.find((e) => e.slug === a.embalse)?.nombre ?? a.embalse}`}
                {a.reguladoDesde && ` desde ${a.reguladoDesde}`}
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
                className={`boton-mini ${porDefecto.includes(a.slug) ? "marcado" : ""}`}
                aria-pressed={porDefecto.includes(a.slug)}
                title="Se ve destacado para quien no tiene cuenta"
                onClick={() => accion(() => enviar("/api/admin/por-defecto", "PUT", { tipo: "rio", slug: a.slug, destacado: !porDefecto.includes(a.slug) }))}
              >
                {porDefecto.includes(a.slug) ? "★ Por defecto" : "☆ Por defecto"}
              </button>
              <button className="boton-mini" onClick={() => empezarEdicion(a)}>
                Editar
              </button>
              <button
                className="boton-mini peligro"
                onClick={() => confirm(`¿Quitar ${a.nombre}? Se borrarán también sus lecturas guardadas.`) && accion(() => enviar(`/api/admin/aforos/${a.slug}`, "DELETE"))}
              >
                Quitar
              </button>
            </div>
          </div>
        ),
      )}

      {elegido ? (
        <form
          className="editar-rio"
          onSubmit={async (ev) => {
            ev.preventDefault();
            if (await accion(() => enviar("/api/admin/aforos", "POST", { elemento: elegido.elemento, ...aCuerpo(form) }))) {
              setElegido(null);
              setBusca("");
              await abrirCatalogo();
            }
          }}
        >
          <p>
            Añadir el aforo <b>{elegido.nombre}</b> <span className="suave">({elegido.demarcacion || "sin demarcación"})</span>
          </p>
          <CamposRio f={form} set={setForm} embalses={embalses ?? null} />
          <div className="acciones">
            <button className="boton" disabled={ocupado}>
              {ocupado ? "Añadiendo…" : "Añadir río"}
            </button>
            <button type="button" className="boton-secundario" onClick={() => setElegido(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : catalogo ? (
        <div className="buscador-embalses">
          <Campo etiqueta="Añadir un río" ayuda="Busca el aforo por el lugar donde está (p. ej. «Teruel», «Calamocha») o por la cuenca">
            <input value={busca} placeholder="Escribe al menos 2 letras…" onChange={(e) => setBusca(e.target.value)} />
          </Campo>
          {resultados.map((c) => (
            <div key={c.elemento} className="fila-propia">
              <div>
                <b>{c.nombre}</b>
                <small>
                  {c.demarcacion || "Sin demarcación"} · {n(c.lat, 3)}, {n(c.lon, 3)} ·{" "}
                  <a href={`https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=13/${c.lat}/${c.lon}`} target="_blank" rel="noreferrer">
                    ver en el mapa
                  </a>
                </small>
              </div>
              {c.elegido ? (
                <span className="insignia gris">Ya está</span>
              ) : (
                <button className="boton-mini" onClick={() => elegir(c)}>
                  Elegir
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <button className="boton-secundario" onClick={abrirCatalogo}>
          + Añadir río
        </button>
      )}
      {error && <p className="error-form">{error}</p>}
      <p className="suave pequeno">
        Los datos en tiempo real llegan solos. El histórico (Anuario de Aforos) se carga aparte con <code>scripts/importar-anuario.mjs</code>; sin él, el río
        se muestra igual, pero sin comparación con lo normal ni histórico, y la previsión solo indica la tendencia.
      </p>
    </section>
  );
}
