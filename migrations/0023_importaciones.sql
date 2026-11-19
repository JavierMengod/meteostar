-- Cola común de importación de históricos, para cualquier red (ecowitt.net, Weather Underground, AEMET).
-- Una fila por estación. Se trae hacia atrás (lo más reciente primero), poco a poco y por turnos entre estaciones,
-- con un cupo por red en cada pasada: escala igual con una estación que con cientos.
CREATE TABLE importaciones (
  estacion_id INTEGER PRIMARY KEY REFERENCES estaciones(id) ON DELETE CASCADE,
  red TEXT NOT NULL,                  -- ecowitt | wunderground | aemet
  codigo TEXT NOT NULL DEFAULT '',    -- la estación en esa red (WU, indicativo de AEMET); ecowitt usa las claves de la estación
  cursor TEXT,                        -- próximo día a pedir (hacia atrás); NULL = terminada
  limite TEXT,                        -- día más antiguo que tiene la red, si se sabe (ecowitt.net lo dice)
  inicio TEXT NOT NULL,               -- día desde el que empezó (el más reciente)
  dias INTEGER NOT NULL DEFAULT 0,    -- días con datos traídos
  vacios INTEGER NOT NULL DEFAULT 0,  -- peticiones seguidas sin datos (para saber cuándo ya no hay más)
  fallos INTEGER NOT NULL DEFAULT 0,  -- fallos seguidos
  error TEXT,                         -- último fallo
  turno INTEGER NOT NULL DEFAULT 0,   -- cuándo se atendió por última vez (o hasta cuándo espera tras fallos)
  creada INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX importaciones_pendientes ON importaciones (red, turno) WHERE cursor IS NOT NULL;

-- Las que había (histórico de Weather Underground y de AEMET, guardado en la tabla de estaciones)
INSERT INTO importaciones (estacion_id, red, codigo, cursor, inicio, vacios)
  SELECT id, 'wunderground', historico_wu, historico_pendiente, date('now'), coalesce(historico_vacios, 0)
  FROM estaciones WHERE historico_wu IS NOT NULL;
INSERT OR IGNORE INTO importaciones (estacion_id, red, codigo, cursor, inicio, vacios)
  SELECT id, 'aemet', aemet,
    CASE WHEN coalesce(historico_vacios, 0) >= 2 THEN NULL ELSE coalesce(historico_pendiente, date('now')) END,
    date('now'), coalesce(historico_vacios, 0)
  FROM estaciones WHERE aemet IS NOT NULL;

ALTER TABLE estaciones DROP COLUMN historico_wu;
ALTER TABLE estaciones DROP COLUMN historico_pendiente;
ALTER TABLE estaciones DROP COLUMN historico_vacios;
