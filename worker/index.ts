// Meteostar: Worker de Cloudflare. Sirve la web (React) y la API, y tiene las tareas programadas.
import { Hono } from "hono";
import cuenta from "./api/cuenta";
import publica from "./api/publica";
import { leerEstaciones } from "./cron";
import { borrarAntiguas } from "./db";
import { actualizarAforos } from "./aforos";
import { avanzarCalculos } from "./calculos-aforos";
import { refrescarEmbalses } from "./embalses";
import { avanzarHistoricoWU, comprobarCruce, tocaCruce } from "./cruce";
import { avanzarHistoricoAemet, completarRecientesAemet, refrescarAemet } from "./aemet";
import { actualizarHistorico, refrescarResumenes } from "./historico-aforos";
import { archivarRadar } from "./radar";
import { actualizarSatelite } from "./seguimiento";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", publica);
app.route("/api", cuenta);
app.notFound((c) => c.json({ error: "no encontrado" }, 404));
app.onError((e, c) => {
  console.error(e);
  return c.json({ error: "Error interno" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    const t = Math.floor(controller.scheduledTime / 1000);
    // Cada 10 minutos: imágenes del satélite (en su propia invocación, con su propio cupo de peticiones)
    if (controller.cron === "3-59/10 * * * *") {
      ctx.waitUntil(actualizarSatelite(env, ctx));
      return;
    }
    // Cada 2 minutos: lecturas de los aforos de río, por tandas (en su propia invocación, con su propio cupo de peticiones)
    if (controller.cron === "1-59/2 * * * *") {
      // Después, un trozo de los cálculos del histórico y un resumen: así ninguna pasada pasa de los límites del plan
      // gratuito (10 ms de CPU y 50 consultas a D1 por ejecución)
      ctx.waitUntil(
        actualizarAforos(env)
          .then(() => avanzarCalculos(env, 1))
          .then(() => refrescarResumenes(env, 1))
          .then(() => refrescarEmbalses(env, ctx, 1))
          .catch((e) => console.error("aforos", e)),
      );
      return;
    }
    // Cada 10 minutos: archivo del radar de la zona (otra invocación aparte)
    if (controller.cron === "8-59/10 * * * *") {
      ctx.waitUntil(archivarRadar(env).catch((e) => console.error("radar", e)));
      // Otras redes: histórico de Weather Underground de las dadas de alta (poco a poco) y, una vez por semana, el cruce
      // entre Meteoclimatic y Weather Underground (gemelas y avisos de calidad)
      ctx.waitUntil(
        avanzarHistoricoWU(env)
          .then(() => avanzarHistoricoAemet(env))
          .then(() => completarRecientesAemet(env))
          .then(() => refrescarAemet(env))
          .then(async () => {
            if (await tocaCruce(env, Math.floor(controller.scheduledTime / 1000))) await comprobarCruce(env);
          })
          .catch((e) => console.error("otras redes", e)),
      );
      // Una vez al día (03:08 UTC): medias diarias de los aforos (los resúmenes se rehacen poco a poco con las lecturas)
      const d = new Date(controller.scheduledTime);
      if (d.getUTCHours() === 3 && d.getUTCMinutes() < 10) ctx.waitUntil(actualizarHistorico(env).catch((e) => console.error("histórico aforos", e)));
      return;
    }
    // Cada minuto: estaciones que se leen por API
    await leerEstaciones(env, t);
    if (new Date(controller.scheduledTime).getUTCMinutes() === 0) ctx.waitUntil(borrarAntiguas(env.DB, t));
  },
} satisfies ExportedHandler<Env>;
