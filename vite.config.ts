import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // Pre-empaquetar estas dependencias evita que Vite cargue dos copias de React en desarrollo
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react-leaflet", "leaflet", "recharts"] },
});
