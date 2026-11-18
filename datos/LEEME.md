# Datos históricos de los aforos

Caudal diario del **Anuario de Aforos** (MITECO / CEDEX), generado con `scripts/importar-anuario.mjs`.
Fuente: «© Ministerio para la Transición Ecológica y el Reto Demográfico».

Al publicar la web, se cargan en Cloudflare D1 **en días distintos**: el plan gratuito de D1 admite unas
100.000 filas escritas al día y cada archivo tiene algo menos.

```
# Un archivo al día (cada uno tiene menos de 100.000 filas):
npx wrangler d1 execute meteostar --remote --file datos/anuario-aforos-1.sql
npx wrangler d1 execute meteostar --remote --file datos/anuario-aforos-2.sql   # al día siguiente
# … y así hasta el 8. El 3 es pequeño y puede ir el mismo día que otro.
```

| Archivo | Aforos |
|---|---|
| `anuario-aforos-1.sql` | Turia en Teruel (08015), Alfambra en Teruel (08027), Guadalaviar en Tramacastilla (08014) |
| `anuario-aforos-2.sql` | Alfambra en Villalba Alta (08028), Mijares en El Terde (08030), Guadalaviar a la salida de Arquillo (08096), Guadalaviar en Gea (08149) |
| `anuario-aforos-3.sql` | Turia en Torrealta, Torrebaja (08103) |
| `anuario-aforos-4.sql` | Ebrón en Los Santos, Turia en Zagra, Mijares (entrada y salida de Arenós), Júcar en Venta de Juan Romero |
| `anuario-aforos-5.sql` | Cabriel en Pajaroncillo, Tuéjar en Calles, Palancia (Jérica y Fuente del Baño), San Martín en Víllora |
| `anuario-aforos-6.sql` | Turia a la salida de Loriguilla, Cabriel en Víllora, Ojos de Moya en Camporrobles, Guadazaón en Huércemes |
| `anuario-aforos-7.sql` | Turia en Bugarra, Mijares (salida de Sichar y El Colmenar), Júcar en Cuenca |
| `anuario-aforos-8.sql` | Cabriel a la salida de Contreras, Magro en Requena |
