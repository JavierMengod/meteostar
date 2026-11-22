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

# Días de la hoja completados con Weather Underground

`wu-villastar.sql`: completa los días de la hoja (`origen = 'hoja'`) con las lecturas de Weather Underground, generado
con `scripts/completar-wu.mjs`:

- Del 30/10/2025 al 26/4/2026, de **IVILLA1897** (la misma estación que la actual): todos los datos con hora, salvo la
  lluvia, que se queda la de la hoja (ya comprobada). Quedan con `origen = 'wu'`.
- Del 26/1/2025 al 29/10/2025, de **IVILLA1699** (la estación anterior, de la que salen esos días de la hoja): solo lo
  que le falta a la hoja (humedad, presión, radiación, UV, intensidad y la hora de los extremos si coinciden). Quedan
  con `origen = 'hoja+wu'`.

Solo toca días con `origen = 'hoja'`: se carga **después** de `hoja-villastar.sql`.

```
npx wrangler d1 execute meteostar --remote --file datos/wu-villastar.sql
```

# Histórico de las estaciones de otras redes (AEMET, Weather Underground, ecowitt.net)

Al dar de alta una estación, su histórico se pone en la **cola de importaciones** (tabla `importaciones`). El worker la
avanza solo cada 10 minutos (tarea `5-59/10`), de lo más reciente hacia atrás y por turnos entre estaciones, con un cupo
por red: vale igual con una estación que con cientos, pero por los límites de Cloudflare va despacio con históricos largos.

Para traer **de golpe** lo pendiente (p. ej. 40 años de una estación de AEMET), desde el ordenador:

```
node scripts/importar-historicos.mjs --remote            # todo lo pendiente de AEMET y Weather Underground
node scripts/importar-historicos.mjs --remote --solo teruel
```

Usa el mismo código que el worker para convertir y guardar los días, y deja la importación marcada como hecha (la cola
ya no la toca). Va tan rápido como deja cada red (AEMET pide una pausa de un minuto cada pocas decenas de consultas: unos
minutos por estación). Para respetar el límite de D1 gratuito (100.000 filas escritas al día) se para a las 80.000
(`--max-filas`): lo que quede lo sigue la cola, o se vuelve a ejecutar al día siguiente. Weather Underground da un día
por consulta y la clave unas 1.500 al día (compartidas con la web): como mucho 800 por ejecución (`--max-wu`).
ecowitt.net no va en el script (sus claves están cifradas en la base de datos): lo trae la cola.

# Máximas y mínimas de Villastar corregidas con Weather Underground (27/4 – 5/9/2026)

`extremos-villastar.sql`: de lo que ecowitt.net guarda de hace más de 3 meses solo hay un dato cada 30 minutos, así que
las máximas y mínimas importadas de abril a agosto de 2026 salían suavizadas (comparadas con la hoja de cálculo de la
estación, unas décimas: la máxima más baja y la mínima más alta). Generado con `scripts/corregir-extremos-wu.mjs` a
partir de las observaciones cada 5 minutos de la misma estación en Weather Underground (IVILLA1897): solo cambia un
extremo si el de Weather Underground es más extremo (con su hora), y rehace la media del 27/4 (primer día, incompleto).
Tras cargarlo, las máximas y mínimas coinciden con la hoja salvo en días en los que la hoja cuenta el día en hora de
Londres (la de la consola) en lugar de la española.

```
npx wrangler d1 execute meteostar --remote --file datos/extremos-villastar.sql
npx wrangler d1 execute meteostar --remote --command "DELETE FROM cache WHERE clave LIKE 'extremos%' OR clave LIKE 'meses/%'"
```
