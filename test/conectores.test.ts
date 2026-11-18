import { describe, expect, it } from "vitest";
import { comprobarContrasena, contrasenaValida, emailValido, hashContrasena } from "../worker/auth";
import { leerMeteoclimatic, leerObservacionesAemet, leerWunderground } from "../worker/conectores";
import { leerEnvioConsola } from "../worker/ecowitt";
import { slugDe } from "../worker/estaciones";
import { leerRssEstacion } from "../worker/meteoclimatic";

describe("Meteoclimatic", () => {
  const xml = `<?xml version="1.0" encoding="ISO-8859-15"?><meteodata><stations><station>
    <id>ESARA4400000044000A</id><pubDate>Sun, 15 Nov 2026 20:57:15 +0000</pubDate>
    <stationdata>
      <temperature><unit>C</unit><now>12.2</now><max>16.8</max><min>11.0</min></temperature>
      <humidity><unit>%</unit><now>83</now><max>92</max><min>63</min></humidity>
      <barometre><unit>hPa</unit><now>1024.1</now><max>1024.8</max><min>1021.1</min></barometre>
      <wind><unit>kmh</unit><now>2</now><azimuth>99</azimuth><max>23</max></wind>
      <rain><unit>mm</unit><total>1.4</total></rain>
    </stationdata></station></stations></meteodata>`;

  it("lee los datos actuales y los extremos del día", () => {
    const r = leerMeteoclimatic(xml);
    const l = r.lecturas[0];
    expect(l.ts).toBe(Date.UTC(2026, 10, 15, 20, 57) / 1000);
    expect(l).toMatchObject({ fuente: "meteoclimatic", temp: 12.2, hum: 83, presion: 1024.1, viento: 2, dir: 99, lluvia_dia: 1.4 });
    expect(l.rocio).not.toBeNull();
    expect(r.extremos).toMatchObject({ tmax: 16.8, tmin: 11, racha_max: 23, hum_min: 63 });
  });

  it("falla si la estación no existe", () => {
    expect(() => leerMeteoclimatic("<meteodata><stations></stations></meteodata>")).toThrow();
  });

  it("toma su estación del feed de la provincia (que trae varias)", () => {
    const otra = xml.replace("ESARA4400000044000A", "ESARA4400000044999B").replace("<now>12.2</now>", "<now>3.5</now>");
    const provincia = otra.replace("</stations>", xml.slice(xml.indexOf("<station>"), xml.indexOf("</stations>")) + "</stations>");
    expect(leerMeteoclimatic(provincia, "ESARA4400000044000A").lecturas[0].temp).toBe(12.2);
    expect(leerMeteoclimatic(provincia, "ESARA4400000044999B").lecturas[0].temp).toBe(3.5);
    expect(() => leerMeteoclimatic(provincia, "ESARA4400000044123C")).toThrow();
  });
});

describe("Weather Underground", () => {
  it("lee la observación actual en métrico", () => {
    const l = leerWunderground({
      observations: [
        {
          stationID: "ITERUE1",
          epoch: 1794777000,
          humidity: 81,
          winddir: 270,
          solarRadiation: 120.5,
          uv: 1,
          metric: { temp: 9.4, dewpt: 6.3, windSpeed: 12.2, windGust: 20.5, pressure: 1018.3, precipRate: 0.5, precipTotal: 2.3 },
        },
      ],
    })!;
    expect(l).toMatchObject({ fuente: "wunderground", temp: 9.4, hum: 81, rocio: 6.3, viento: 12.2, racha: 20.5, dir: 270, presion: 1018.3, lluvia_dia: 2.3, intensidad: 0.5 });
    expect(l.ts).toBe(1794777000 - (1794777000 % 60));
  });

  it("devuelve null sin observaciones", () => {
    expect(leerWunderground({ observations: [] })).toBeNull();
  });
});

describe("AEMET", () => {
  const obs = [
    { fint: "2026-11-15T22:00:00+0000", ta: 6.1, hr: 85, pres: 905.2, pres_nmar: 1019.8, vv: 2.5, vmax: 6, dv: 300, prec: 0.4, tpr: 3.7 },
    { fint: "2026-11-15T21:00:00+0000", ta: 6.8, hr: 80, pres: 905.0, pres_nmar: 1019.5, vv: 3, vmax: 7, dv: 290, prec: 0.6 },
    // 23:00 UTC = 00:00 en Madrid: su lluvia es del día anterior y el día nuevo empieza en 0
    { fint: "2026-11-15T23:00:00+0000", ta: 5.9, hr: 86, pres: 905.3, pres_nmar: 1020, vv: 1, vmax: 3, dv: 280, prec: 0.2 },
  ];

  it("ordena las observaciones, pasa el viento a km/h y acumula la lluvia del día", () => {
    const l = leerObservacionesAemet(obs);
    expect(l.map((x) => x.temp)).toEqual([6.8, 6.1, 5.9]);
    expect(l[0]).toMatchObject({ fuente: "aemet", viento: 10.8, racha: 25.2, presion: 1019.5, presion_abs: 905, intensidad: 0.6 });
    expect(l[0].lluvia_dia).toBe(0.6);
    expect(l[1].lluvia_dia).toBe(1);
    expect(l[2].lluvia_dia).toBe(0);
  });
});

describe("envío directo con protocolo Weather Underground", () => {
  it("entiende baromin, UV y los campos interiores", () => {
    const l = leerEnvioConsola(
      { ID: "x", PASSWORD: "y", dateutc: "now", tempf: "44.6", humidity: "80", baromin: "30.01", UV: "2", indoortempf: "68", indoorhumidity: "45" },
      Date.UTC(2026, 10, 15, 21, 0, 30) / 1000,
    );
    expect(l).toMatchObject({ fuente: "directo", temp: 7, hum: 80, presion: 1016.3, uv: 2, temp_int: 20, hum_int: 45 });
  });
});

describe("cuentas", () => {
  it("guarda y comprueba contraseñas", async () => {
    const { hash, sal } = await hashContrasena("una contraseña larga");
    expect(await comprobarContrasena("una contraseña larga", hash, sal)).toBe(true);
    expect(await comprobarContrasena("otra contraseña", hash, sal)).toBe(false);
    // Misma contraseña, distinta sal → distinto hash
    expect((await hashContrasena("una contraseña larga")).hash).not.toBe(hash);
  });

  it("valida email y contraseña", () => {
    expect(emailValido("ana@ejemplo.es")).toBe(true);
    expect(emailValido("ana@")).toBe(false);
    expect(contrasenaValida("corta")).toBe(false);
    expect(contrasenaValida("suficientemente larga")).toBe(true);
  });

  it("crea direcciones limpias para las estaciones", () => {
    expect(slugDe("Villastar - Vega del Turia")).toBe("villastar-vega-del-turia");
    expect(slugDe("Cañada de Benatanduz")).toBe("canada-de-benatanduz");
    expect(slugDe("¡¡¡")).toBe("estacion");
  });
});

describe("Meteoclimatic: RSS de una estación", () => {
  const rss = `<rss><channel><item><title>Rubielos de Mora (Teruel)</title><pubDate>Wed, 18 Nov 2026 09:55:00 +0000</pubDate>
    <description><![CDATA[<ul><li>Actualizado: 18-11-2026 09:55 UTC</li>
    <li>Temperatura: <b>18,2</b> &#186;C ( M&#225;x.: <b>18,2</b> / M&#237;n.: <b>15,2</b> )</li>
    <li>Humedad: <b>72,0</b> % ( M&#225;x.: <b>77,0</b> / M&#237;n.: <b>64,0</b> )</li>
    <li>Bar&#243;metro: <b>1008,1</b> hPa ( M&#225;x.: <b>1009,1</b> / M&#237;n.: <b>1007,1</b> )</li>
    <li>Viento: <b>16,0</b> km/h ( M&#225;x.: <b>55,0</b> )</li>
    <li>Direcci&#243;n del viento: <b>265</b> - W</li><li>Precip.: <b>0,4</b> mm</li></ul>]]></description></item></channel></rss>`;

  it("lee los valores del texto del RSS", () => {
    expect(leerRssEstacion(rss)).toMatchObject({
      t: Date.UTC(2026, 10, 18, 9, 55) / 1000,
      temp: 18.2,
      tmax: 18.2,
      tmin: 15.2,
      hum: 72,
      presion: 1008.1,
      presion_min: 1007.1,
      viento: 16,
      racha_max: 55,
      dir: 265,
      lluvia: 0.4,
    });
  });

  it("devuelve null si no hay estación", () => {
    expect(leerRssEstacion("<rss><channel></channel></rss>")).toBeNull();
  });
});
