import { defineConfig } from "vitest/config";

// Configuración propia para los tests (sin el plugin de Cloudflare de vite.config.ts)
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
