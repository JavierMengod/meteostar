import { describe, expect, it } from "vitest";
import type { Lectura, PrevisionDia } from "../shared/tipos";
import { lluviaEntreLecturas } from "../worker/api/publica";
import { adaptarOpenMeteo } from "../worker/prevision";
import { textoDia } from "../src/prevision";

const lectura = (ts: number, lluvia_dia: number) => ({ ts, lluvia_dia }) as Lectura;
// 15 nov 2026 a las 22:00 y 23:30 en Madrid; 16 nov a las 00:30
const t22 = Date.UTC(2026, 10, 15, 21, 0) / 1000;
const t2330 = Date.UTC(2026, 10, 15, 22, 30) / 1000;
const t0030 = Date.UTC(2026, 10, 15, 23, 30) / 1000;

describe("lluvia entre dos lecturas", () => {
  it("en el mismo día resta los acumulados", () => {
    expect(lluviaEntreLecturas(lectura(t22, 2), lectura(t2330, 5.5), null)).toBe(3.5);
  });
  it("cruzando la medianoche suma lo que faltaba del día anterior", () => {
    // Ayer terminó con 6 mm; a las 23:30 llevaba 5,5 y hoy a las 00:30 lleva 1
    expect(lluviaEntreLecturas(lectura(t2330, 5.5), lectura(t0030, 1), 6)).toBe(1.5);
  });
  it("sin lecturas devuelve null", () => {
    expect(lluviaEntreLecturas(null, lectura(t0030, 1), 6)).toBeNull();
  });
});

describe("previsión", () => {
  it("adapta la respuesta de Open-Meteo y se queda con la hora en curso y las 48 siguientes", () => {
    const base = Date.UTC(2026, 10, 15, 0, 0) / 1000;
    const n = 72;
    const serie = (v: number) => Array.from({ length: n }, () => v);
    const j = {
      hourly: {
        time: Array.from({ length: n }, (_, i) => base + i * 3600),
        temperature_2m: serie(10.24),
        relative_humidity_2m: serie(70),
        precipitation: serie(0),
        precipitation_probability: serie(5),
        weather_code: serie(2),
        wind_speed_10m: serie(12.4),
        wind_gusts_10m: serie(25),
        wind_direction_10m: serie(200),
        is_day: serie(1),
      },
      daily: {
        time: [base - 3600],
        weather_code: [61],
        temperature_2m_max: [14.6],
        temperature_2m_min: [-0.4],
        precipitation_sum: [3.2],
        precipitation_probability_max: [70],
        wind_speed_10m_max: [25],
        wind_gusts_10m_max: [50],
        wind_direction_10m_dominant: [270],
        sunrise: [base + 7 * 3600],
        sunset: [base + 17 * 3600],
      },
    };
    const p = adaptarOpenMeteo(j, base + 3600);
    expect(p.horas.length).toBe(49);
    expect(p.horas[0].temp).toBe(10.2);
    expect(p.dias[0]).toMatchObject({ fecha: "2026-11-15", tmax: 14.6, lluvia: 3.2, prob: 70 });
  });

  it("redacta el texto del día", () => {
    const dia: PrevisionDia = {
      fecha: "2026-11-16", codigo: 61, tmax: 14.6, tmin: -0.4, lluvia: 3.2, prob: 70,
      viento: 25, racha: 50, dir: 270, salida: 0, puesta: 0,
    };
    const texto = textoDia(dia, []);
    expect(texto).toContain("Máxima de 15 °C y mínima de 0 °C");
    expect(texto).toContain("viento moderado del oeste");
    expect(texto).toContain("70 %");
    expect(texto).toContain("Heladas");
  });
});
