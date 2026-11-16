import { describe, expect, it } from "vitest";
import { anioHidrologico, comparaNormal, diaHidrologico, nombreAnioHidrologico } from "../shared/hidrologia";
import { resumir } from "../worker/historico-aforos";

/** Días de un año hidrológico con caudal constante, salvo una crecida. */
function anio(a: number, caudal: number, crecida?: [string, number]) {
  const filas: { fecha: string; caudal: number }[] = [];
  for (let t = Date.UTC(a, 9, 1); t < Date.UTC(a + 1, 9, 1); t += 86400_000) {
    const fecha = new Date(t).toISOString().slice(0, 10);
    filas.push({ fecha, caudal: crecida && crecida[0] === fecha ? crecida[1] : caudal });
  }
  return filas;
}

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
  const filas = [...anio(1995, 1), ...anio(1996, 2, ["1996-12-10", 50]), ...anio(1997, 3, ["1998-03-01", 80])];
  const r = resumir(filas, [
    { mes: "1996-12", dia: 10, caudal: 120 },
    { mes: "1998-03", dia: null, caudal: 95 },
  ]);

  it("calcula los años completos con su agua y su crecida", () => {
    expect(r.anios.map((a) => a.anio)).toEqual([1995, 1996, 1997]);
    expect(r.anios[0]).toMatchObject({ media: 1, volumen: 31.6, maximo: 1, dias: 366 }); // incluye el 29 de febrero de 1996
    expect(r.anios[1]).toMatchObject({ maximo: 50, fechaMaximo: "1996-12-10" });
    expect(r.disponibles).toEqual([1995, 1996, 1997]);
  });

  it("ordena las crecidas y las puntas", () => {
    expect(r.crecidas[0]).toEqual({ fecha: "1998-03-01", caudal: 80 });
    expect(r.crecidas[1]).toEqual({ fecha: "1996-12-10", caudal: 50 });
    expect(r.puntas).toEqual([
      { fecha: "1996-12-10", caudal: 120 },
      { fecha: "1998-03", caudal: 95 },
    ]);
  });

  it("calcula lo normal de cada día del periodo de referencia", () => {
    expect(r.normal[100]?.[2]).toBe(2);
    expect(r.mesesNormal[6]).toBe(2);
    expect(r.periodoNormal).toBe("1991–2020");
  });
});
