import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Tipografías: Fraunces (títulos y cifras), IBM Plex Sans (texto) e IBM Plex Mono (datos)
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import App from "./App";
import "./estilos.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Aplicación instalable: el service worker solo en producción (en desarrollo estorbaría a la recarga en caliente)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.error("service worker", e));
  });
}
