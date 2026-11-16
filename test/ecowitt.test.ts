import { describe, expect, it } from "vitest";
import { leerEnvioConsola, leerRespuestaApi } from "../worker/ecowitt";
import { fechaAnterior, fechaLocal, inicioDia } from "../worker/fechas";
import { puntoCardinal, puntoRocio, sensacionTermica } from "../shared/meteo";

const AHORA = Date.UTC(2026, 10, 15, 10, 0, 30) / 1000;

describe("envío directo de la consola", () => {
  const formulario = {
    PASSKEY: "ABC",
    stationtype: "EasyWeatherPro_V5.1.6",
    dateutc: "2026-11-15 10:00:12",
    tempf: "50.0",
    humidity: "80",
    baromrelin: "30.00",
    baromabsin: "26.80",
    windspeedmph: "10.0",
    windgustmph: "15.5",
    winddir: "270",
    dailyrainin: "0.10",
    rainratein: "0.00",
    solarradiation: "350.5",
    uv: "3",
    tempinf: "70.0",
    humidityin: "45",
  };

  it("convierte a unidades métricas", () => {
    const l = leerEnvioConsola(formulario, AHORA);
    expect(l.ts).toBe(Date.UTC(2026, 10, 15, 10, 0, 0) / 1000);
    expect(l.fuente).toBe("directo");
    expect(l.temp).toBe(10);
    expect(l.hum).toBe(80);
    expect(l.presion).toBe(1015.9);
    expect(l.viento).toBe(16.1);
    expect(l.racha).toBe(24.9);
    expect(l.dir).toBe(270);
    expect(l.lluvia_dia).toBe(2.5);
    expect(l.radiacion).toBe(350.5);
    expect(l.temp_int).toBe(21.1);
    expect(l.rocio).toBe(6.7);
  });

  it("usa la hora del servidor si dateutc está desfasada o falta", () => {
    expect(leerEnvioConsola({ ...formulario, dateutc: "2020-01-01 00:00:00" }, AHORA).ts).toBe(AHORA - 30);
    expect(leerEnvioConsola({ ...formulario, dateutc: "now" }, AHORA).ts).toBe(AHORA - 30);
  });

  it("deja a null los campos ausentes", () => {
    const l = leerEnvioConsola({ tempf: "32" }, AHORA);
    expect(l.temp).toBe(0);
    expect(l.viento).toBeNull();
    expect(l.lluvia_dia).toBeNull();
  });
});

describe("API v3 de Ecowitt", () => {
  const val = (value: string) => ({ time: String(AHORA - 40), unit: "", value });
  const respuesta = {
    code: 0,
    msg: "success",
    time: String(AHORA),
    data: {
      outdoor: { temperature: val("12.3"), humidity: val("65"), dew_point: val("5.9") },
      indoor: { temperature: val("21.0"), humidity: val("50") },
      solar_and_uvi: { solar: val("410.2"), uvi: val("4") },
      rainfall: { rain_rate: val("0.0"), daily: val("1.2") },
      wind: { wind_speed: val("8.5"), wind_gust: val("14.0"), wind_direction: val("45") },
      pressure: { relative: val("1018.4"), absolute: val("911.2") },
    },
  };

  it("lee los valores", () => {
    const l = leerRespuestaApi(respuesta, AHORA)!;
    expect(l.fuente).toBe("ecowitt_api");
    expect(l.ts).toBe(Date.UTC(2026, 10, 15, 9, 59, 0) / 1000);
    expect(l.temp).toBe(12.3);
    expect(l.rocio).toBe(5.9);
    expect(l.presion).toBe(1018.4);
    expect(l.viento).toBe(8.5);
    expect(l.dir).toBe(45);
    expect(l.lluvia_dia).toBe(1.2);
    expect(l.uv).toBe(4);
  });

  it("devuelve null si la API da error", () => {
    expect(leerRespuestaApi({ code: 40010, msg: "Illegal Application_Key Parameter" }, AHORA)).toBeNull();
  });
});

describe("fechas locales (Europe/Madrid)", () => {
  it("calcula la fecha local", () => {
    // 23:30 UTC del 15 de noviembre = 00:30 del 16 en Madrid (UTC+1)
    expect(fechaLocal(Date.UTC(2026, 10, 15, 23, 30) / 1000)).toBe("2026-11-16");
    // En verano UTC+2
    expect(fechaLocal(Date.UTC(2026, 6, 1, 22, 30) / 1000)).toBe("2026-07-02");
  });

  it("calcula la medianoche local", () => {
    expect(inicioDia("2026-11-16")).toBe(Date.UTC(2026, 10, 15, 23, 0) / 1000);
    expect(inicioDia("2026-07-02")).toBe(Date.UTC(2026, 6, 1, 22, 0) / 1000);
    // Días de cambio de hora
    expect(inicioDia("2026-03-29")).toBe(Date.UTC(2026, 2, 28, 23, 0) / 1000);
    expect(inicioDia("2026-10-25")).toBe(Date.UTC(2026, 9, 24, 22, 0) / 1000);
  });

  it("calcula el día anterior", () => {
    expect(fechaAnterior("2026-03-01")).toBe("2026-02-28");
    expect(fechaAnterior("2026-01-01")).toBe("2025-12-31");
  });
});

describe("cálculos meteorológicos", () => {
  it("punto de rocío", () => {
    expect(puntoRocio(20, 50)).toBeCloseTo(9.3, 1);
    expect(puntoRocio(20, null)).toBeNull();
  });

  it("sensación térmica", () => {
    expect(sensacionTermica(0, 80, 20)).toBeCloseTo(-5.2, 1);
    expect(sensacionTermica(18, 50, 10)).toBe(18);
    expect(sensacionTermica(32, 60, 5)!).toBeGreaterThan(32);
  });

  it("punto cardinal", () => {
    expect(puntoCardinal(0)).toBe("N");
    expect(puntoCardinal(359)).toBe("N");
    expect(puntoCardinal(225)).toBe("SO");
    expect(puntoCardinal(null)).toBe("—");
  });
});
