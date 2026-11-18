import { describe, expect, it } from "vitest";
import { adaptarSerie, juntar, lecturasNuevas, reducir, tendencia, ultimaLectura, unirMini } from "../worker/aforos";

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

  it("guarda solo las lecturas nuevas y la última media hora", () => {
    const filas: [number, number | null, number | null][] = [[1000, 1, 0.4], [3000, 1, 0.4], [4000, null, 0.4], [5000, 1, 0.4]];
    expect(lecturasNuevas(filas, null)).toHaveLength(4);
    expect(lecturasNuevas(filas, 4000).map((f) => f[0])).toEqual([3000, 4000, 5000]);
  });

  it("junta la minigráfica guardada con las lecturas nuevas, una por hora y solo 48 h", () => {
    const ahora = 100 * 3600;
    const previa: [number, number][] = [[40 * 3600, 9], [60 * 3600, 1], [99 * 3600, 2]];
    const nuevas: [number, number | null, number | null][] = [[99 * 3600 + 600, 3, null], [100 * 3600, 4, null]];
    expect(unirMini(previa, nuevas, ahora)).toEqual([[60 * 3600, 1], [99 * 3600, 2], [100 * 3600, 4]]);
  });
});
