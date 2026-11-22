// Caché compartida de Cloudflare (Cache API, por centro de datos): para no repetir consultas caras a la base de datos.
// El plan gratuito de D1 admite 5 millones de filas leídas al día; lo que no cambia (o cambia poco) se guarda aquí.

/** Lo guardado con esa clave o, si no hay (o ha caducado), lo calcula y lo guarda «segundos». */
export async function enCache<T>(clave: string, segundos: number, calcular: () => Promise<T>, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<T> {
  const url = `https://cache.meteostar.internal/${clave}`;
  try {
    const guardada = await caches.default.match(url);
    if (guardada) return (await guardada.json()) as T;
  } catch {
    // sin caché (p. ej. en pruebas): se calcula
  }
  const valor = await calcular();
  const guardar = caches.default
    .put(url, new Response(JSON.stringify(valor), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${segundos}` } }))
    .catch(() => {});
  if (ctx) ctx.waitUntil(guardar);
  else await guardar;
  return valor;
}

/**
 * Como enCache, pero guardado en la base de datos (tabla «cache»): para lo que vale horas o un día. Funciona en
 * cualquier dirección (la caché de Cloudflare puede no guardar nada en las *.workers.dev) y leerlo cuesta 1 fila.
 */
export async function enCacheD1<T>(db: D1Database, clave: string, segundos: number, calcular: () => Promise<T>): Promise<T> {
  // Si la tabla aún no existe (migración pendiente), se calcula sin guardar
  const guardado = await db
    .prepare("SELECT valor FROM cache WHERE clave = ? AND caduca > unixepoch()")
    .bind(clave)
    .first<string>("valor")
    .catch((e: unknown) => (/no such table/i.test(String(e)) ? null : Promise.reject(e)));
  if (guardado) return JSON.parse(guardado) as T;
  const valor = await calcular();
  await db
    .prepare("INSERT INTO cache (clave, valor, caduca) VALUES (?, ?, unixepoch() + ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, caduca = excluded.caduca")
    .bind(clave, JSON.stringify(valor), segundos)
    .run()
    .catch((e: unknown) => (/no such table/i.test(String(e)) ? null : Promise.reject(e)));
  return valor;
}

/** Borra lo caducado (una vez al día, con la limpieza). */
export async function limpiarCache(db: D1Database) {
  await db.prepare("DELETE FROM cache WHERE caduca < unixepoch()").run();
}
