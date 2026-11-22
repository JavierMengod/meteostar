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
