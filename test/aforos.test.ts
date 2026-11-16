import { describe, expect, it } from "vitest";
import { adaptarSerie, juntar, reducir, tendencia, ultimaLectura } from "../worker/aforos";

const respuesta = {
  dates: ["2026-11-16T12:10:00+00:00", "2026-11-16T12:20:00+00:00", "2026-11-16T12:30:00+00:00", "malo"],
  values: [0.96, null, 1.2, 3],
  thresholds: [
    { level: 2, value: 40 },
    { level: 1, value: 20 },
    { level: 3, value: 50 },
  ],
};

describe("aforos", () => {
  it("convierte la respuesta del Observatorio y ordena los umbrales", () => {
    const s = adaptarSerie(respuesta);
    expect(s.puntos).toEqual([
      [Date.UTC(2026, 10, 16, 12, 10) / 1000, 0.96],
      [Date.UTC(2026, 10, 16, 12, 30) / 1000, 1.2],
    ]);
    expect(s.umbrales).toEqual([20, 40, 50]);
    expect(adaptarSerie(null)).toEqual({ puntos: [], umbrales: [] });
  });

  it("junta caudal y nivel y toma el último de cada uno", () => {
    const filas = juntar(
      [
        [100, 1],
        [200, 1.1],
      ],
      [
        [200, 0.4],
        [300, 0.41],
      ],
    );
    expect(filas).toEqual([
      [100, 1, null],
      [200, 1.1, 0.4],
      [300, null, 0.41],
    ]);
    // El caudal llega más tarde que el nivel: no se pierde
    expect(ultimaLectura(filas)).toEqual({ t: 200, caudal: 1.1, nivel: 0.41 });
    expect(ultimaLectura([])).toBeNull();
  });

  it("calcula la variación del caudal en 3 horas", () => {
    const serie: [number, number | null, number | null][] = [
      [0, 1, null],
      [3600, 1.2, null],
      [3 * 3600, 1.5, null],
      [4 * 3600, null, 0.5],
    ];
    expect(tendencia(serie)).toBe(0.5);
    expect(tendencia([[0, 1, null]])).toBeNull();
  });

  it("deja una lectura por hora en lo que tiene más de 48 h", () => {
    const ahora = 100 * 3600;
    const serie: [number, number | null, number | null][] = [];
    for (let t = 0; t <= ahora; t += 600) serie.push([t, 1, 0.4]);
    const r = reducir(serie, ahora);
    const viejos = r.filter((p) => p[0] < ahora - 48 * 3600);
    expect(viejos.length).toBe(52);
    expect(r.filter((p) => p[0] >= ahora - 48 * 3600).length).toBe(48 * 6 + 1);
  });
});
