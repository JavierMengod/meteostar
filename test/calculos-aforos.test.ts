import { describe, expect, it } from "vitest";
import { NECESARIOS_ANUARIO, NECESARIOS_SIN_ANUARIO, diasDelMes, mesesConMargen, percentilesDias, siguienteTrozo } from "../worker/calculos-aforos";

describe("cálculos por trozos", () => {
  it("sabe qué días tiene cada mes del año hidrológico", () => {
    expect(diasDelMes(0)).toEqual([0, 30]); // octubre
    expect(diasDelMes(4)).toEqual([123, 151]); // febrero (con el 29)
    expect(diasDelMes(11)).toEqual([336, 365]); // septiembre
  });

  it("pide el mes anterior y el siguiente para el margen de ±7 días", () => {
    expect(mesesConMargen(0)).toEqual([9, 10, 11]); // octubre
    expect(mesesConMargen(2)).toEqual([11, 12, 1]); // diciembre
    expect(mesesConMargen(3)).toEqual([12, 1, 2]); // enero
  });

  it("calcula los percentiles de cada día con la ventana de ±7 días", () => {
    const valores: [number, number][] = [];
    for (let d = 0; d < 366; d++) valores.push([d, d === 10 ? 100 : 1]);
    const r = percentilesDias(valores, 0, 30, [0.5, 1]);
    expect(r).toHaveLength(31);
    expect(r[0]).toEqual([0, 1, 1]); // el día 10 queda fuera de la ventana del día 0 (está a 10 días)
    expect(r[5]).toEqual([5, 1, 100]); // pero dentro de la del día 5
  });

  it("va trozo a trozo hasta completar los que necesita cada aforo", () => {
    expect(siguienteTrozo(true, 0)).toBe(0);
    expect(siguienteTrozo(true, 0b111)).toBe(3);
    expect(siguienteTrozo(true, NECESARIOS_ANUARIO)).toBeNull();
    expect(siguienteTrozo(false, 0)).toBe(16);
    expect(siguienteTrozo(false, NECESARIOS_SIN_ANUARIO)).toBeNull();
  });
});
