import { describe, expect, it } from "vitest";
import { DURACIONES_RADAR, elegirImagenes } from "../shared/radar";
import { teselasZona } from "../worker/radar";

// 24 h de imágenes cada 10 minutos
const fin = Date.UTC(2026, 10, 16, 0, 20) / 1000;
const lista = Array.from({ length: 145 }, (_, i) => ({ t: fin - (144 - i) * 600 }));

describe("selección de imágenes del radar", () => {
  it("1 h: 7 imágenes cada 10 minutos", () => {
    const r = elegirImagenes(lista, 60, 10);
    expect(r.length).toBe(7);
    expect(r.at(-1)!.t).toBe(fin);
  });

  it("24 h: una por hora, terminando en la última", () => {
    const r = elegirImagenes(lista, 1440, 60);
    expect(r.length).toBe(25);
    expect(r.every((x) => (fin - x.t) % 3600 === 0)).toBe(true);
  });

  it("ninguna duración pasa de 25 imágenes", () => {
    for (const [m, , paso] of DURACIONES_RADAR) expect(elegirImagenes(lista, m, paso).length).toBeLessThanOrEqual(25);
  });

  it("con poco archivo, devuelve lo que hay", () => {
    expect(elegirImagenes(lista.slice(-13), 1440, 60).map((x) => x.t)).toEqual([fin - 7200, fin - 3600, fin]);
    expect(elegirImagenes([], 60, 10)).toEqual([]);
  });
});

describe("zona archivada", () => {
  it("calcula las teselas de zoom 7 que la cubren", () => {
    const t = teselasZona([
      [38.084, -7.658],
      [42.484, 5.342],
    ]);
    expect(t.length).toBe(15);
    expect(t.every(([z]) => z === 7)).toBe(true);
    // Villastar (40,28 N, 1,16 O) cae en la tesela 7/63/48
    expect(t).toContainEqual([7, 63, 48]);
  });
});
