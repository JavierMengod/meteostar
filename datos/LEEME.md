# Datos históricos de los aforos

Caudal diario del **Anuario de Aforos** (MITECO / CEDEX), generado con `scripts/importar-anuario.mjs`.
Fuente: «© Ministerio para la Transición Ecológica y el Reto Demográfico».

Al publicar la web, se cargan en Cloudflare D1 **en días distintos**: el plan gratuito de D1 admite unas
100.000 filas escritas al día y cada archivo tiene algo menos.

```
# Un archivo al día (cada uno tiene menos de 100.000 filas):
npx wrangler d1 execute meteostar --remote --file datos/anuario-aforos-1.sql
npx wrangler d1 execute meteostar --remote --file datos/anuario-aforos-2.sql   # al día siguiente
# … y así hasta el 7. El 3 es pequeño y puede ir el mismo día que cualquiera de los otros.
```

| Archivo | Aforos |
|---|---|
| `anuario-aforos-1.sql` | Turia en Teruel (08015), Alfambra en Teruel (08027), Guadalaviar en Tramacastilla (08014) |
| `anuario-aforos-2.sql` | Alfambra en Villalba Alta (08028), Mijares en El Terde (08030), Guadalaviar a la salida de Arquillo (08096), Guadalaviar en Gea (08149) |
| `anuario-aforos-3.sql` | Turia en Torrealta, Torrebaja (08103) |
| `anuario-aforos-4.sql` | Martín en Híjar (9014), Jiloca en Calamocha (9042), Matarraña en Beceite (9052) |
| `anuario-aforos-5.sql` | Figuerales en Valderrobres (9113), Martín en Oliete (9118), Pena en Beceite (9110) |
| `anuario-aforos-6.sql` | Guadalope en Santolea (9106), Guadalopillo en Berge (9100), Martín en Alcaine (9127), Guadalopillo al pie de Gallipuén (9201, solo 1977–1999) |
| `anuario-aforos-7.sql` | Algas en Horta de Sant Joan (9153), Pena en Valderrobres (9109), Ulldemó en Beceite (9297) |

Los del Ebro (4–7) se generaron de la carpeta `EBRO` del anuario: el código de cada aforo del Observatorio
(ES091_A052) es el del SAIH del Ebro, que el anuario relaciona con su estación (9052) en `estaf.csv` (columna `cod_saih`).

Sin histórico en el anuario: Albentosa a la salida de Los Toranes, Jiloca en Villarquemado, Martín en Montalbán,
Guadalope y Pitarque en Villarluengo, Bordón y Barranco de Tornos (estaciones del SAIH que no son del anuario).
Río Seco en Oliete (9262) está, pero solo con nivel, sin caudal, y no se ha cargado.

# Histórico de Villastar de la hoja de cálculo (2025 – abril de 2026)

`hoja-villastar.sql`: los días del 1/1/2025 al 26/4/2026 (481), de la hoja de cálculo de la estación (Ecowitt), anteriores
a lo que guarda ecowitt.net. Generado con `scripts/importar-hoja.mjs` a partir de la hoja «Datos_diarios» exportada a CSV.
Lluvia, máxima, mínima, media, viento medio, viento máximo y racha de cada día (sin hora ni humedad, presión o
radiación). Solo añade días que no existen (no pisa nada) y los marca con `origen = 'hoja'`.

En producción, **después** de crear Villastar (slug `villastar`) e importar su histórico de ecowitt.net:

```
npx wrangler d1 execute meteostar --remote --file datos/hoja-villastar.sql
```
