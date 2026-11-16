import { describe, expect, it } from "vitest";
import { instantes } from "../worker/seguimiento";

const utc = (s: string) => Date.parse(s);
const primera = utc("2024-09-23T00:00:00Z");

describe("fotogramas del satélite", () => {
  it("3 horas cada 20 minutos hasta el final", () => {
    const r = instantes(primera, utc("2026-11-15T19:40:00Z"), 3);
    expect(r.paso).toBe(20);
    expect(r.lista.length).toBe(10);
    expect(new Date(r.lista.at(-1)!).toISOString()).toBe("2026-11-15T19:40:00.000Z");
  });

  it("redondea el final a 10 minutos", () => {
    const r = instantes(primera, utc("2026-11-10T10:07:00Z"), 1);
    expect(new Date(r.lista.at(-1)!).toISOString()).toBe("2026-11-10T10:00:00.000Z");
    expect(r.lista.length).toBe(7);
  });

  it("24 horas: una imagen cada 2 horas", () => {
    const r = instantes(primera, utc("2026-11-15T20:00:00Z"), 24);
    expect(r.paso).toBe(120);
    expect(r.lista.length).toBe(13);
  });

  it("no pide imágenes anteriores al inicio del archivo", () => {
    const r = instantes(primera, utc("2024-09-23T06:00:00Z"), 24);
    expect(Math.min(...r.lista)).toBeGreaterThanOrEqual(primera);
  });
});
