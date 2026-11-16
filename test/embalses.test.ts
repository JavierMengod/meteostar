import { describe, expect, it, vi } from "vitest";
import { adaptarDetalle, adaptarEmbalse, totalEmbalses } from "../worker/embalses";
import { localAUnix } from "../worker/fechas";

const ficha = {
  slug: "calanda",
  nombre: "Calanda",
  rio_canonico: "Guadalope",
  provincia: "Teruel",
  cuenca: "Ebro",
  capacidad_catalogo_hm3: 54,
  coordenadas: { lat: 40.9, lng: -0.27 },
  observacion: { fecha: "2026-11-10", capacidad_hm3: 54, volumen_hm3: 26, fill_percentage: 48.15, variacion_semanal_hm3: 0 },
  dato_reciente: { fuente: "SAIH Ebro", observed_at: "2026-11-15 22:15:00", volumen_hm3: 25.398, fill_percentage: 46.75, nivel_m: 428.47 },
};
const historico = [
  { fecha: "2026-11-10", volumen_hm3: 26, fill_percentage: 48.15 },
  { fecha: "2020-06-02", volumen_hm3: 51, fill_percentage: 94.4 },
  { fecha: "2024-09-03", volumen_hm3: 10, fill_percentage: 18.5 },
];

describe("embalses", () => {
  it("adapta la ficha, el histórico y el dato reciente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T22:00:00Z"));
    const e = adaptarEmbalse(ficha, historico);
    vi.useRealTimers();
    expect(e).toMatchObject({ nombre: "Calanda", rio: "Guadalope", capacidad: 54, volumen: 26, porcentaje: 48.15, variacion: 0, fecha: "2026-11-10" });
    expect(e.maximo).toEqual({ volumen: 51, fecha: "2020-06-02" });
    expect(e.minimo).toEqual({ volumen: 10, fecha: "2024-09-03" });
    expect(e.desde).toBe("2020-06-02");
    expect(e.serie.at(-1)).toEqual(["2026-11-10", 48.15]);
    // 22:15 en Madrid (UTC+1) = 21:15 UTC
    expect(e.reciente).toMatchObject({ ts: Date.UTC(2026, 10, 15, 21, 15) / 1000, volumen: 25.398, nivel: 428.47, fuente: "SAIH Ebro" });
  });

  it("descarta el dato reciente si es viejo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
    expect(adaptarEmbalse(ficha, historico).reciente).toBeNull();
    vi.useRealTimers();
  });

  it("suma la reserva total", () => {
    const a = adaptarEmbalse(ficha, null);
    const b = { ...a, slug: "pena", volumen: 11, capacidad: 18, variacion: -1 };
    expect(totalEmbalses([a, b])).toEqual({ volumen: 37, capacidad: 72, porcentaje: 51.4, variacion: -1 });
    expect(totalEmbalses([])).toBeNull();
  });

  it("convierte la hora de Madrid a UTC (invierno y verano)", () => {
    expect(localAUnix("2026-11-15 22:15:00")).toBe(Date.UTC(2026, 10, 15, 21, 15) / 1000);
    expect(localAUnix("2026-07-01 12:00:00")).toBe(Date.UTC(2026, 6, 1, 10, 0) / 1000);
  });
});

describe("página de un embalse", () => {
  it("compara con hace un año y con la media de la misma semana", () => {
    const hist = [
      { fecha: "2026-11-10", volumen_hm3: 26, fill_percentage: 48, variacion_semanal_hm3: 0 },
      { fecha: "2025-11-11", volumen_hm3: 34, fill_percentage: 63, variacion_semanal_hm3: 2 },
      { fecha: "2024-11-12", volumen_hm3: 12, fill_percentage: 22, variacion_semanal_hm3: 0 },
      { fecha: "2023-11-14", volumen_hm3: 40, fill_percentage: 74, variacion_semanal_hm3: 1 },
      // Fuera del margen de ±4 días: no cuenta
      { fecha: "2022-12-01", volumen_hm3: 50, fill_percentage: 92, variacion_semanal_hm3: 0 },
    ];
    const d = adaptarDetalle(ficha, hist);
    expect(d.historico.map((s) => s.fecha)).toEqual(["2022-12-01", "2023-11-14", "2024-11-12", "2025-11-11", "2026-11-10"]);
    expect(d.haceUnAnio).toMatchObject({ fecha: "2025-11-11", volumen: 34 });
    expect(d.mediaSemana).toEqual({ volumen: 28.7, porcentaje: 53, anios: 3 });
  });
});
