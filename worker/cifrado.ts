// Cifrado de la configuración de los conectores (claves de API de cada usuario) con AES-GCM.
// La clave está en el secreto CLAVE_CIFRADO (32 bytes en base64).

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function clave(env: Env): Promise<CryptoKey> {
  if (!env.CLAVE_CIFRADO) throw new Error("Falta el secreto CLAVE_CIFRADO");
  return crypto.subtle.importKey("raw", deB64(env.CLAVE_CIFRADO), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function cifrar(env: Env, datos: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const texto = new TextEncoder().encode(JSON.stringify(datos));
  const cifrado = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await clave(env), texto);
  return `v1:${b64(iv)}:${b64(cifrado)}`;
}

export async function descifrar<T = Record<string, string>>(env: Env, valor: string | null): Promise<T> {
  if (!valor) return {} as T;
  const [version, iv, datos] = valor.split(":");
  if (version !== "v1") throw new Error("Formato de configuración desconocido");
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(iv) }, await clave(env), deB64(datos));
  return JSON.parse(new TextDecoder().decode(plano));
}
