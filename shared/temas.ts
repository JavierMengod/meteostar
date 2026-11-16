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
  /** Colores para la muestra: fondo, tinta (cabecera) y acento */
  muestra: [string, string, string];
}

export const TEMAS: InfoTema[] = [
  { id: "auto", nombre: "Automático", detalle: "Papel o cielo nocturno, como tu dispositivo", modo: null, muestra: ["#f3efe6", "#0c0e1c", "#d99a25"] },
  { id: "claro", nombre: "Papel", detalle: "Claro: papel, tinta azul y dorado", modo: "claro", muestra: ["#f3efe6", "#151a3d", "#d99a25"] },
  { id: "oscuro", nombre: "Cielo nocturno", detalle: "Oscuro: azul noche y dorado", modo: "oscuro", muestra: ["#0c0e1c", "#141730", "#f0b34a"] },
  { id: "arena", nombre: "Arena", detalle: "Claro, tierra y ocre", modo: "claro", muestra: ["#ece2cf", "#3d2a17", "#d08a2c"] },
  { id: "mudejar", nombre: "Mudéjar", detalle: "Cerámica de Teruel: verde y terracota", modo: "claro", muestra: ["#eef0e8", "#173d2e", "#c9592f"] },
  { id: "noche", nombre: "Noche", detalle: "Oscuro, azul y plata", modo: "oscuro", muestra: ["#08101f", "#0f1a30", "#8fb4ff"] },
  { id: "bosque", nombre: "Bosque", detalle: "Oscuro, verde", modo: "oscuro", muestra: ["#0b130e", "#121d16", "#7ed6a2"] },
  { id: "contraste", nombre: "Alto contraste", detalle: "Negro y amarillo, máxima legibilidad", modo: "oscuro", muestra: ["#000000", "#0a0a0a", "#ffd400"] },
];

export const esTema = (v: unknown): v is Tema => typeof v === "string" && (IDS_TEMA as readonly string[]).includes(v);
export const modoTema = (t: Tema) => TEMAS.find((x) => x.id === t)?.modo ?? null;
