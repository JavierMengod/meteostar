import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { esTema, modoTema, type Tema } from "../shared/temas";
import type { UsuarioSesion } from "../shared/tipos";

/** Pide un JSON y lo vuelve a pedir cada `intervalo` ms (0 = solo una vez). */
export function usePeticion<T>(url: string | null, intervalo = 60_000) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** fresco: sin la caché del navegador (tras un cambio hecho por el usuario) */
  const cargar = useCallback(async (fresco = false) => {
    if (!url) return;
    try {
      const r = await fetch(url, fresco ? { cache: "reload" } : undefined);
      if (!r.ok) throw new Error(r.status === 404 ? "no encontrado" : `HTTP ${r.status}`);
      setDatos(await r.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [url]);

  useEffect(() => {
    setDatos(null);
    cargar();
    if (!intervalo) return;
    const id = setInterval(() => cargar(), intervalo);
    return () => clearInterval(id);
  }, [cargar, intervalo]);

  return { datos, error, recargar: () => cargar(true) };
}

/** Envía JSON a la API. Devuelve la respuesta o lanza un Error con el mensaje del servidor. */
export async function enviar<T = unknown>(url: string, metodo: "POST" | "PUT" | "DELETE", datos?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: metodo,
    headers: { "content-type": "application/json" },
    body: datos === undefined ? undefined : JSON.stringify(datos),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
  return j as T;
}

// ===== Rutas (URL normales: /estacion/villastar, /cuenta…) =====

export interface Ruta {
  pagina:
    | "red"
    | "estacion"
    | "horas"
    | "dias"
    | "radar"
    | "satelite"
    | "rios"
    | "rio"
    | "embalses"
    | "embalse"
    | "fuentes"
    | "entrar"
    | "registro"
    | "primeros-pasos"
    | "cuenta"
    | "editar-estacion"
    | "admin"
    | "no-encontrada";
  /** Parámetro de la ruta: slug de estación, id a editar ("nueva")… */
  param?: string;
  query: URLSearchParams;
}

export function leerRuta(): Ruta {
  const p = location.pathname.replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(location.search);
  const partes = p.split("/").filter(Boolean).map(decodeURIComponent);
  const simples: Record<string, Ruta["pagina"]> = {
    "/": "red",
    "/prevision": "horas",
    "/prevision/14-dias": "dias",
    "/radar": "radar",
    "/satelite": "satelite",
    "/rios": "rios",
    "/embalses": "embalses",
    "/fuentes": "fuentes",
    "/entrar": "entrar",
    "/registro": "registro",
    "/primeros-pasos": "primeros-pasos",
    "/cuenta": "cuenta",
    "/admin": "admin",
  };
  if (simples[p]) return { pagina: simples[p], query };
  if (partes[0] === "estacion" && partes[1]) return { pagina: "estacion", param: partes[1], query };
  if (partes[0] === "embalses" && partes[1]) return { pagina: "embalse", param: partes[1], query };
  if (partes[0] === "rios" && partes[1]) return { pagina: "rio", param: partes[1], query };
  if (partes[0] === "cuenta" && partes[1] === "estacion" && partes[2]) return { pagina: "editar-estacion", param: partes[2], query };
  return { pagina: "no-encontrada", query };
}

/** Navega sin recargar la página. */
export function navegar(url: string, reemplazar = false) {
  if (reemplazar) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  dispatchEvent(new Event("navegacion"));
}

export function useRuta(): Ruta {
  const [ruta, setRuta] = useState<Ruta>(leerRuta);
  useEffect(() => {
    const cambio = () => {
      setRuta(leerRuta());
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
    };
    // Enlaces internos (<a href="/...">) sin recargar
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a");
      const href = a?.getAttribute("href");
      if (!a || !href || !href.startsWith("/") || href.startsWith("//") || a.target || a.hasAttribute("download")) return;
      e.preventDefault();
      if (href !== location.pathname + location.search) navegar(href);
    };
    addEventListener("popstate", cambio);
    addEventListener("navegacion", cambio);
    document.addEventListener("click", clic);
    return () => {
      removeEventListener("popstate", cambio);
      removeEventListener("navegacion", cambio);
      document.removeEventListener("click", clic);
    };
  }, []);
  return ruta;
}

// ===== Sesión =====

export interface EstadoSesion {
  usuario: UsuarioSesion | null;
  necesitaConfiguracion: boolean;
  cargada: boolean;
  recargar: () => Promise<void>;
}

export const Sesion = createContext<EstadoSesion>({ usuario: null, necesitaConfiguracion: false, cargada: false, recargar: async () => {} });
export const useSesion = () => useContext(Sesion);

export function useEstadoSesion(): EstadoSesion {
  const [estado, setEstado] = useState<Omit<EstadoSesion, "recargar">>({ usuario: null, necesitaConfiguracion: false, cargada: false });
  const recargar = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/estado");
      const j = await r.json();
      setEstado({ usuario: j.usuario, necesitaConfiguracion: j.necesitaConfiguracion, cargada: true });
    } catch {
      setEstado((e) => ({ ...e, cargada: true }));
    }
  }, []);
  useEffect(() => {
    recargar();
  }, [recargar]);
  return { ...estado, recargar };
}

// ===== Tema =====
// El tema es el de la cuenta (se elige en «Mi cuenta» y vale en cualquier dispositivo).
// Sin sesión, «auto»: el del dispositivo. El último tema se recuerda en el navegador solo para
// pintarlo desde el primer instante (ver index.html) mientras se comprueba la sesión.

export type { Tema };

export interface EstadoTema {
  tema: Tema;
  poner: (t: Tema) => Promise<void>;
}

export const TemaContexto = createContext<EstadoTema>({ tema: "auto", poner: async () => {} });
export const useTemaActual = () => useContext(TemaContexto);

function aplicarTema(t: Tema) {
  const raiz = document.documentElement;
  const modo = modoTema(t);
  if (t === "auto") raiz.removeAttribute("data-theme");
  else raiz.setAttribute("data-theme", t);
  if (modo === "oscuro") raiz.setAttribute("data-modo", "oscuro");
  else raiz.removeAttribute("data-modo");
  try {
    localStorage.setItem("tema", t);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export function useTema(sesion: { usuario: UsuarioSesion | null; cargada: boolean }): EstadoTema {
  const [tema, setTema] = useState<Tema>(() => {
    try {
      const t = localStorage.getItem("tema");
      return esTema(t) ? t : "auto";
    } catch {
      return "auto";
    }
  });
  // En cuanto se sabe si hay sesión: el tema de la cuenta, o el del dispositivo si no hay
  const temaCuenta = sesion.usuario?.tema;
  useEffect(() => {
    if (sesion.cargada) setTema(temaCuenta && esTema(temaCuenta) ? temaCuenta : "auto");
  }, [sesion.cargada, temaCuenta]);
  useEffect(() => aplicarTema(tema), [tema]);
  const poner = useCallback(async (t: Tema) => {
    await enviar("/api/cuenta/tema", "PUT", { tema: t });
    setTema(t);
  }, []);
  return { tema, poner };
}
