// Service worker de Meteostar: hace la web instalable y permite abrirla sin conexión.
//  - Páginas: primero la red; sin conexión, la última copia guardada de la aplicación.
//  - Ficheros de la aplicación (/assets/, con huella en el nombre), iconos y tipografías: de la caché, que no cambian.
//  - Datos (/api/): siempre de la red, nunca se guardan aquí (el tiempo tiene que ser el de ahora).
const VERSION = "meteostar-v1";
const INICIO = ["/", "/manifest.webmanifest", "/favicon.svg", "/iconos/icono-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(INICIO)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Navegación: red primero, y la aplicación guardada si no hay conexión
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(VERSION).then((c) => c.put("/", copia));
          }
          return r;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }

  // Ficheros estáticos: caché primero; lo que se descarga se guarda para la próxima vez
  if (/^\/(assets|iconos)\/|\.(woff2?|png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (guardada) =>
          guardada ||
          fetch(req).then((r) => {
            if (r.ok) {
              const copia = r.clone();
              caches.open(VERSION).then((c) => c.put(req, copia));
            }
            return r;
          }),
      ),
    );
  }
});
