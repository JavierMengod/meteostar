import { describe, expect, it } from "vitest";
import { anioHidrologico, comparaNormal, diaHidrologico, nombreAnioHidrologico } from "../shared/hidrologia";
import { mayoresCrecidas, mayoresPuntas, modeloDeFilas, normalDeFilas } from "../worker/historico-aforos";


describe("año hidrológico", () => {
  it("empieza el 1 de octubre", () => {
    expect(anioHidrologico("2021-10-01")).toBe(2021);
    expect(anioHidrologico("2022-09-30")).toBe(2021);
    expect(nombreAnioHidrologico(2021)).toBe("2021-22");
    expect(nombreAnioHidrologico(1999)).toBe("1999-00");
  });

  it("coloca cada día en la misma posición todos los años", () => {
    expect(diaHidrologico("2021-10-01")).toBe(0);
    expect(diaHidrologico("2021-11-01")).toBe(31);
    expect(diaHidrologico("2022-01-01")).toBe(92);
    expect(diaHidrologico("2023-03-01")).toBe(152); // año no bisiesto: el 29 de febrero queda vacío
    expect(diaHidrologico("2024-02-29")).toBe(151);
    expect(diaHidrologico("2022-09-30")).toBe(365);
  });

  it("compara con los percentiles de la época", () => {
    const p: [number, number, number, number, number] = [1, 2, 3, 4, 5];
    expect(comparaNormal(0.5, p).texto).toBe("Muy por debajo de lo normal");
    expect(comparaNormal(3, p).texto).toBe("Normal para la época");
    expect(comparaNormal(6, p).texto).toBe("Muy por encima de lo normal");
  });
});

describe("resumen del histórico", () => {
  it("deja una crecida por episodio a partir de los candidatos ordenados", () => {
    const candidatos = [
      { fecha: "1998-03-01", caudal: 80 },
      { fecha: "1998-03-02", caudal: 75 },
      { fecha: "1996-12-10", caudal: 50 },
      { fecha: "1996-12-15", caudal: 49 },
      { fecha: "2001-05-01", caudal: 20 },
    ];
    expect(mayoresCrecidas(candidatos)).toEqual([
      { fecha: "1998-03-01", caudal: 80 },
      { fecha: "1996-12-10", caudal: 50 },
      { fecha: "2001-05-01", caudal: 20 },
    ]);
  });

  it("pone fecha completa a las puntas con día y solo el mes a las que no", () => {
    expect(
      mayoresPuntas([
        { mes: "1996-12", dia: 10, caudal: 120 },
        { mes: "1998-03", dia: null, caudal: 95 },
      ]),
    ).toEqual([
      { fecha: "1996-12-10", caudal: 120 },
      { fecha: "1998-03", caudal: 95 },
    ]);
  });

  it("coloca lo normal de cada día en su sitio del año hidrológico", () => {
    const n = normalDeFilas([{ dia: 46, p10: 1, p25: 2, p50: 3, p75: 4, p90: 5 }]);
    expect(n).toHaveLength(366);
    expect(n[46]).toEqual([1, 2, 3, 4, 5]);
    expect(n[0]).toBeNull();
  });

  it("solo da la corrección del modelo si están las cuatro estaciones del año", () => {
    const parte = JSON.stringify({ modelo: [0, 1], aforo: [0, 2] });
    const cuatro = [0, 1, 2, 3].map((trozo) => ({ tipo: "correccion", trozo, datos: parte }));
    expect(modeloDeFilas(cuatro, { lat: 40, lon: -1 }).correccion).toEqual({ modelo: [[0, 1], [0, 1], [0, 1], [0, 1]], aforo: [[0, 2], [0, 2], [0, 2], [0, 2]], lat: 40, lon: -1 });
    expect(modeloDeFilas(cuatro.slice(0, 3), { lat: 40, lon: -1 }).correccion).toBeNull();
    expect(modeloDeFilas([...cuatro.slice(0, 3), { tipo: "correccion", trozo: 3, datos: null }], { lat: 40, lon: -1 }).correccion).toBeNull();
  });

  it("monta lo normal del modelo a partir de sus trozos", () => {
    const c = modeloDeFilas([{ tipo: "clima", trozo: 1, datos: JSON.stringify([[31, 1.5, 4]]) }], null).climaModelo!;
    expect(c[31]).toEqual([1.5, 4]);
    expect(c[0]).toBeNull();
  });
});
