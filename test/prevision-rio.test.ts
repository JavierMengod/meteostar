import { describe, expect, it } from "vitest";
import { avisoPrevision, calcularCorreccion, componerPrevision, corregir, estacionDelAnio } from "../worker/prevision-rio";
import { type FilaAforo, miniSerie, tarjeta } from "../worker/aforos";
import { estadoDatos, mensajePrevision, situacionAforo } from "../shared/rios";
import type { DiaRio } from "../shared/tipos";

describe("corrección del modelo", () => {
  it("asigna la estación del año", () => {
    expect(estacionDelAnio("2026-01-15")).toBe(0);
    expect(estacionDelAnio("2026-12-01")).toBe(0);
    expect(estacionDelAnio("2026-04-10")).toBe(1);
    expect(estacionDelAnio("2026-07-10")).toBe(2);
    expect(estacionDelAnio("2026-11-17")).toBe(3);
  });

  it("pasa los valores del modelo a la escala del aforo", () => {
    const qm = [0, 1, 2, 4];
    const qa = [0.5, 1, 1.5, 3];
    expect(corregir(1, qm, qa)).toBe(1);
    expect(corregir(3, qm, qa)).toBe(2.25);
    // Por encima de lo visto se suma lo que sobra, sin multiplicar
    expect(corregir(6, qm, qa)).toBe(4.5);
    expect(corregir(10, [0, 1, 2, 4], [0, 2, 4, 8])).toBe(14);
  });

  it("calcula los cuantiles solo si hay años suficientes en cada estación", () => {
    const aforo: { fecha: string; caudal: number }[] = [];
    const modelo = new Map<string, number>();
    for (let t = Date.UTC(2000, 0, 1); t < Date.UTC(2004, 0, 1); t += 86400_000) {
      const fecha = new Date(t).toISOString().slice(0, 10);
      aforo.push({ fecha, caudal: 1 });
      modelo.set(fecha, 4);
    }
    const c = calcularCorreccion(aforo, modelo, { lat: 40, lon: -1 })!;
    expect(c.modelo).toHaveLength(4);
    expect(c.modelo[0][10]).toBe(4);
    expect(c.aforo[0][10]).toBe(1);
    expect(calcularCorreccion(aforo.slice(0, 200), modelo, { lat: 40, lon: -1 })).toBeNull();
  });
});

describe("previsión", () => {
  const reciente = {
    daily: {
      time: ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"],
      river_discharge: [4, 4, 4, 8, 4],
      river_discharge_p25: [null, null, null, 4, 2],
      river_discharge_p75: [null, null, null, 20, 6],
    },
  };
  const correccion = { modelo: Array(4).fill([0, 4, 8, 16]), aforo: Array(4).fill([0, 1, 2, 4]), lat: 40, lon: -1 };

  it("usa lo medido en los días pasados y arranca la previsión en el último caudal medido", () => {
    const p = componerPrevision({
      reciente,
      hoy: "2026-11-17",
      correccion,
      normalAforo: () => ({ normal: 1, alto: 1.5 }),
      normalModelo: null,
      medidos: new Map([["2026-11-16", 0.9]]),
      ultimoMedido: 2,
    });
    expect(p.corregida).toBe(true);
    expect(p.dias[1].caudal).toBe(0.9);
    // Hoy el modelo corregido da 1 y se mide 2: mañana el 2 corregido se multiplica por 1 + (2 - 1) · 6/7
    expect(p.dias[3].caudal).toBeCloseTo(3.71, 2);
    expect(p.aviso?.nivel).toBe("probable");
  });

  it("sin histórico no corrige y avisa con lo normal del modelo", () => {
    const p = componerPrevision({
      reciente,
      hoy: "2026-11-17",
      correccion: null,
      normalAforo: null,
      normalModelo: () => ({ normal: 4, alto: 10 }),
      medidos: new Map(),
      ultimoMedido: null,
    });
    expect(p.corregida).toBe(false);
    expect(p.dias[3].caudal).toBe(8);
    expect(p.aviso).toEqual({ nivel: "posible", fecha: "2026-11-18", caudal: 20 });
  });

  it("no avisa si nada supera lo habitual", () => {
    const dias: DiaRio[] = [{ fecha: "2026-11-18", caudal: 1, minimo: 1, maximo: 1.2, normal: 1, alto: 2, prevision: true }];
    expect(avisoPrevision(dias)).toBeNull();
  });

  it("da un único mensaje coherente", () => {
    const dia = (fecha: string, caudal: number, prevision: boolean): DiaRio => ({ fecha, caudal, minimo: null, maximo: null, normal: 1, alto: 2, prevision });
    const baja = mensajePrevision({ corregida: true, aviso: { nivel: "posible", fecha: "2026-11-20", caudal: 3 }, dias: [dia("2026-11-17", 2, false), dia("2026-11-18", 1.8, true), dia("2026-11-19", 1.2, true)] })!;
    expect(baja.titulo).toBe("Lo más probable: seguirá bajando");
    expect(baja.detalle).toContain("En 1 de cada 4 escenarios podría crecer");
    const sube = mensajePrevision({ corregida: true, aviso: null, dias: [dia("2026-11-17", 1, false), dia("2026-11-18", 1.5, true)] })!;
    expect(sube.titulo).toContain("subirá");
  });
});

describe("portada de ríos", () => {
  it("usa el nivel en la minigráfica si el aforo no da caudal", () => {
    const serie: [number, number | null, number | null][] = [
      [0, null, 0.4],
      [3600, null, 0.5],
    ];
    expect(miniSerie(serie, 3600)).toEqual([
      [0, 0.4],
      [3600, 0.5],
    ]);
  });

  it("monta la tarjeta con la última lectura guardada en la fila del aforo", () => {
    const fila = {
      slug: "turia-teruel", nombre: "Turia en Teruel", rio: "Turia", codigo: "08015", elemento: "x", confederacion: "Júcar",
      lat: 40.3, lon: -1.1, embalse: null, regulado_desde: null, umbrales: "[20,40,50]", celda_lat: null, celda_lon: null,
      orden: 1, destacado: 1, ultimo_t: 100, ultimo_caudal: 0.96, ultimo_nivel: 0.4, tendencia: -0.03,
      mini: "[[0,1],[100,0.96]]", normal_hoy: "[0.6,0.9,1.2,1.5,2.5]", leido: 100,
    } satisfies FilaAforo;
    const t = tarjeta(fila);
    expect(t.ultimo).toEqual({ t: 100, caudal: 0.96, nivel: 0.4 });
    expect(t.umbrales).toEqual([20, 40, 50]);
    expect(t.normalHoy?.[2]).toBe(1.2);
    expect(t.mini).toHaveLength(2);
    expect(tarjeta({ ...fila, ultimo_t: null, mini: null, normal_hoy: null }).ultimo).toBeNull();
  });

  it("deja una lectura por hora de las últimas 48 h", () => {
    const ahora = 100 * 3600;
    const serie: [number, number | null, number | null][] = [];
    for (let t = 0; t <= ahora; t += 600) serie.push([t, 1, null]);
    expect(miniSerie(serie, ahora)).toHaveLength(49);
  });

  it("separa el aviso oficial de cómo va frente a lo normal", () => {
    const base = { umbrales: [20, 40, 50], normalHoy: [0.6, 0.9, 1.2, 1.5, 2.5] as [number, number, number, number, number] };
    const tranquilo = situacionAforo({ ...base, ultimo: { t: 0, caudal: 0.8, nivel: null } });
    expect(tranquilo.textoAviso).toBe("Sin aviso");
    expect(tranquilo.normal?.corto).toBe("Bajo");
    expect(tranquilo.siguienteAviso).toBe("Aviso amarillo a partir de 20 m³/s");
    const crecida = situacionAforo({ ...base, ultimo: { t: 0, caudal: 45, nivel: null } });
    expect(crecida.textoAviso).toBe("Aviso naranja");
    expect(crecida.color).toBe("#ff8c1a");
  });
});

describe("estado de los datos de un aforo", () => {
  const ahora = 100_000;
  it("distingue sin datos, datos antiguos y sin agua", () => {
    expect(estadoDatos({ ultimo: null }, ahora)).toEqual({ estado: "sin-datos", sinAgua: false });
    expect(estadoDatos({ ultimo: { t: ahora - 3600, caudal: 1, nivel: 0.4 } }, ahora)).toEqual({ estado: "ok", sinAgua: false });
    expect(estadoDatos({ ultimo: { t: ahora - 18 * 3600, caudal: null, nivel: -0.05 } }, ahora)).toEqual({ estado: "antiguo", sinAgua: true });
    expect(estadoDatos({ ultimo: { t: ahora, caudal: 0, nivel: 0.02 } }, ahora).sinAgua).toBe(true);
  });

  it("no da aviso ni comparación si el aforo no publica datos", () => {
    const s = situacionAforo({ ultimo: null, umbrales: [20, 40, 50], normalHoy: [1, 2, 3, 4, 5] }, ahora);
    expect(s).toMatchObject({ estado: "sin-datos", aviso: -1, textoAviso: null, normal: null, pastilla: "Sin datos", color: "#9ca3af" });
    expect(situacionAforo({ ultimo: { t: ahora, caudal: null, nivel: 0 }, umbrales: [], normalHoy: null }, ahora).pastilla).toBe("Sin agua");
  });

  it("un barranco seco es lo normal, aunque lleve horas sin publicar", () => {
    const tornos = { rio: "Barranco de Tornos", nombre: "Barranco de Tornos", umbrales: [], normalHoy: null };
    const s = situacionAforo({ ...tornos, ultimo: { t: ahora - 18 * 3600, caudal: null, nivel: -0.05 } }, ahora);
    expect(s).toMatchObject({ estado: "ok", barrancoSeco: true, pastilla: "Seco" });
    // Con nivel no se puede asegurar que lleve agua (puede ser el cero de la escala): sin etiqueta
    expect(situacionAforo({ ...tornos, ultimo: { t: ahora, caudal: null, nivel: 0.4 } }, ahora).pastilla).toBeNull();
  });
});
