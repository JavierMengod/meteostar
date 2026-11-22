-- Resultados guardados de cálculos caros (p. ej. extremos y récords de todo el histórico hasta ayer), para no repetirlos
-- en cada visita: el plan gratuito de D1 admite 5 millones de filas leídas al día. Leer uno cuesta 1 fila.
CREATE TABLE cache (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  caduca INTEGER NOT NULL
) WITHOUT ROWID;
