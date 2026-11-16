# Meteostar

Red de estaciones meteorológicas sobre Cloudflare Workers: cada usuario (por invitación) da de alta sus estaciones y sus lugares de previsión; el administrador añade además estaciones oficiales. Un único Worker sirve la web (React) y la API, guarda los datos en D1 y tiene tareas programadas.

## Cómo llegan los datos

Cada estación tiene un **conector** (`worker/conectores.ts`):

| Conector | Cómo funciona |
|---|---|
| **Envío directo** | La consola envía cada minuto a `/api/ingest/<clave de la estación>` (protocolo Ecowitt por POST o Weather Underground por GET). Opcionalmente, reserva por ecowitt.net si la consola calla 150 s. |
| **ecowitt.net** | El cron lee la API v3 de la cuenta del usuario cada minuto. |
| **Weather Underground** | El cron lee la API de estaciones personales cada 5 minutos. |
| **Meteoclimatic** | El cron lee el XML público de la estación cada 10 minutos (CC BY-NC-ND). |
| **AEMET** (solo administrador, estaciones oficiales) | El cron lee las observaciones horarias de AEMET OpenData cada 30 minutos. |

Para añadir una fuente nueva basta con añadir un conector a la lista `CONECTORES`. Las claves de API de cada estación se guardan cifradas (AES-GCM) en D1.

```
consolas ──(envío directo)──▶ /api/ingest/<clave> ─┐
APIs (ecowitt, WU, Meteoclimatic, AEMET) ◀── cron ─┤──▶ D1: estaciones, lecturas (8 días), resumen diario
                                                   │
EUMETSAT ◀── cron cada 10 min ──▶ KV (imágenes de satélite)
                                                   ▼
                              navegador ◀── /api/red, /api/estaciones/<slug>/…, /api/prevision…
```

## Radar y satélite

- **Radar:** [RainViewer](https://www.rainviewer.com/), últimas 2 horas cada 10 minutos.
- **Satélite:** [EUMETSAT](https://view.eumetsat.int/) (Meteosat MTG, CC BY 4.0): color (GeoColour, con luces de las ciudades de noche) e infrarrojo. El cron guarda en KV las imágenes de las últimas 24 h; la de color se publica con 1-2 h de retraso y se reintenta cada 30 minutos.
- Costas y fronteras del satélite (`public/satelite-costas.png`): Natural Earth (dominio público).

## Embalses

Página `/embalses` con los embalses que elige el administrador (por defecto, los de Teruel y la cuenca del Turia). Los datos vienen de la API pública de [MapasDeEmbalses.es](https://mapasdeembalses.es/aviso-legal/#legal-api): boletín semanal del MITECO, histórico semanal desde 2019 y, cuando lo hay, el dato reciente del SAIH (el Ebro sí lo da; el Júcar no tiene acceso abierto). No se guardan: el Worker los cachea (1 h el estado, 6 h el histórico). Su uso exige atribución visible a MapasDeEmbalses.es y a la fuente original, que la página muestra.

Los ríos (nivel y caudal) quedan pendientes de fuente.

## Estructura

| Carpeta | Contenido |
|---|---|
| `worker/` | Worker (Hono): `api/` (pública y de cuentas), conectores, cron, base de datos, cuentas y cifrado |
| `src/` | Web en React: `paginas/` (red, estación, previsión, radar, satélite, cuenta, editor, administración) y `componentes/` |
| `shared/` | Tipos y cálculos meteorológicos comunes |
| `migrations/` | Esquema de la base de datos D1 |
| `test/` | Tests (Vitest) |

## Desarrollo local

Requiere Node 22 o superior.

```bash
npm install
cp .dev.vars.example .dev.vars        # y rellenar
npm run db:migrar:local
npm run dev
npm test
```

La primera vez, entra en `/primeros-pasos` con el `SETUP_TOKEN` para crear la cuenta de administrador.

## Puesta en marcha en Cloudflare

1. `npx wrangler login`
2. `npx wrangler d1 create meteostar` y copiar el `database_id` en `wrangler.jsonc`.
3. `npx wrangler kv namespace create IMAGENES` y copiar el `id` en `wrangler.jsonc`.
4. `npm run db:migrar`
5. Secretos:
   ```bash
   npx wrangler secret put CLAVE_CIFRADO   # 32 bytes en base64
   npx wrangler secret put SETUP_TOKEN     # para crear el primer administrador
   npx wrangler secret put AEMET_API_KEY   # opcional, para las estaciones oficiales
   ```
6. `npm run deploy`
7. Abrir `/primeros-pasos`, crear el administrador y, desde **Administración**, invitar a los demás.

## Configurar una consola Ecowitt

En la app WS View Plus (o la web de la consola) → *Weather Services* → *Customized*: protocolo **Ecowitt**, servidor = el dominio de la web, ruta = la que aparece en la ficha de la estación (`/api/ingest/<clave>`), puerto 80, intervalo 60 s. La consola envía por HTTP: el dominio tiene que aceptarlo sin redirigir a HTTPS.
