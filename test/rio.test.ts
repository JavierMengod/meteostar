import { describe, expect, it } from "vitest";
import { adaptarRio, climatologia } from "../worker/rio";

/** Histórico sintético: 10 años con caudal 1 salvo un pico de 20 cada 1 de noviembre. */
function historicoSintetico() {
  const time: string[] = [];
  const river_discharge: number[] = [];
  for (let a = 2010; a < 2020; a++) {
    for (let d = 0; d < 365; d++) {
      const f = new Date(Date.UTC(a, 0, 1 + d)).toISOString().slice(0, 10);
      time.push(f);
      river_discharge.push(f.endsWith("-11-01") ? 20 : 1);
    }
  }
  return { daily: { time, river_discharge } };
}

describe("río", () => {
  it("calcula lo normal (mediana) y lo alto (p90) de cada época", () => {
    const h = historicoSintetico().daily;
    const c = climatologia(h.time.map((f, i) => [f, h.river_discharge[i]] as [string, number]));
    expect(c.get(150)).toEqual({ normal: 1, alto: 1 });
  });

  it("separa pasado y previsión y avisa si la previsión supera lo alto", () => {
    const reciente = {
      daily: {
        time: ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"],
        river_discharge: [1, 1.2, 1.1, 3],
        river_discharge_min: [null, null, 0.8, 2],
        river_discharge_max: [null, null, 2.5, 6],
      },
    };
    const r = adaptarRio(historicoSintetico(), reciente, "2026-11-16");
    expect(r.actual).toMatchObject({ fecha: "2026-11-16", caudal: 1.2, normal: 1, prevision: false });
    expect(r.dias[2]).toMatchObject({ prevision: true, minimo: 0.8, maximo: 2.5 });
    // El 17 solo lo supera el escenario más lluvioso (posible); el 18, el central (probable)
    expect(r.aviso).toEqual({ nivel: "probable", fecha: "2026-11-18", caudal: 3 });
    expect(r.desde).toBe("2010-01-01");
  });

  it("sin previsión alta no hay aviso", () => {
    const reciente = { daily: { time: ["2026-11-16", "2026-11-17"], river_discharge: [1, 1], river_discharge_min: [null, 1], river_discharge_max: [null, 1] } };
    expect(adaptarRio(historicoSintetico(), reciente, "2026-11-16").aviso).toBeNull();
  });
});
