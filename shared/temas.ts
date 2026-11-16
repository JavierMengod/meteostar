// Temas de la web. Cada usuario elige el suyo en «Mi cuenta»; sin sesión se usa «auto» (el del dispositivo).
// Los colores de cada tema están en src/estilos.css (:root[data-theme="…"]).

export const IDS_TEMA = ["auto", "claro", "oscuro", "arena", "mudejar", "noche", "bosque", "contraste"] as const;
export type Tema = (typeof IDS_TEMA)[number];

export interface InfoTema {
  id: Tema;
  nombre: string;
  detalle: string;
  /** Familia del tema: decide el aspecto de mapas y controles del navegador. null = la del dispositivo */
  modo: "claro" | "oscuro" | null;
  /** Colores para la muestra: fondo, tarjeta y acento */
  muestra: [string, string, string];
}

export const TEMAS: InfoTema[] = [
  { id: "auto", nombre: "Automático", detalle: "Claro u oscuro, como tu dispositivo", modo: null, muestra: ["#eef1f4", "#151c24", "#0e7c6b"] },
  { id: "claro", nombre: "Claro", detalle: "Siempre claro", modo: "claro", muestra: ["#eef1f4", "#ffffff", "#0e7c6b"] },
  { id: "oscuro", nombre: "Oscuro", detalle: "Siempre oscuro", modo: "oscuro", muestra: ["#0d1218", "#151c24", "#35b9a2"] },
  { id: "arena", nombre: "Arena", detalle: "Cálido, tonos tierra", modo: "claro", muestra: ["#f3eee4", "#fffaf1", "#b06f1d"] },
  { id: "mudejar", nombre: "Mudéjar", detalle: "Cerámica de Teruel: verde y terracota", modo: "claro", muestra: ["#f4f0e8", "#fffdf8", "#2e7d4f"] },
  { id: "noche", nombre: "Noche", detalle: "Azul marino", modo: "oscuro", muestra: ["#0a1120", "#111a2e", "#5b8def"] },
  { id: "bosque", nombre: "Bosque", detalle: "Verde oscuro", modo: "oscuro", muestra: ["#0c140f", "#131e17", "#3fb37f"] },
  { id: "contraste", nombre: "Alto contraste", detalle: "Negro y amarillo, máxima legibilidad", modo: "oscuro", muestra: ["#000000", "#0a0a0a", "#ffd400"] },
];

export const esTema = (v: unknown): v is Tema => typeof v === "string" && (IDS_TEMA as readonly string[]).includes(v);
export const modoTema = (t: Tema) => TEMAS.find((x) => x.id === t)?.modo ?? null;
