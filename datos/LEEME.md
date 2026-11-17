# Datos históricos de los aforos

Caudal diario del **Anuario de Aforos** (MITECO / CEDEX), generado con `scripts/importar-anuario.mjs`.
Fuente: «© Ministerio para la Transición Ecológica y el Reto Demográfico».

Al publicar la web, se cargan en Cloudflare D1 **en días distintos**: el plan gratuito de D1 admite unas
100.000 filas escritas al día y cada archivo tiene algo menos.

```
npx wrangler d1 execute meteostar --remote --file datos/anuario-aforos-1.sql
# al día siguiente:
npx wrangler d1 execute meteostar --remote --file datos/anuario-aforos-2.sql
# (el 3 es pequeño: puede ir el mismo día que el 1 o el 2)
npx wrangler d1 execute meteostar --remote --file datos/anuario-aforos-3.sql
```

| Archivo | Aforos |
|---|---|
| `anuario-aforos-1.sql` | Turia en Teruel (08015), Alfambra en Teruel (08027), Guadalaviar en Tramacastilla (08014) |
| `anuario-aforos-2.sql` | Alfambra en Villalba Alta (08028), Mijares en El Terde (08030), Guadalaviar a la salida de Arquillo (08096), Guadalaviar en Gea (08149) |
| `anuario-aforos-3.sql` | Turia en Torrealta, Torrebaja (08103) |
