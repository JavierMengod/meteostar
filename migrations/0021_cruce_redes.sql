-- Cruce entre Meteoclimatic y Weather Underground.
-- Gemelas: la misma estación enviando a las dos redes (cerca y con la misma máxima y mínima del día).
CREATE TABLE gemelas (
  mc TEXT NOT NULL,              -- código de Meteoclimatic
  wu TEXT NOT NULL,              -- código de Weather Underground
  km REAL NOT NULL,
  iguales INTEGER NOT NULL DEFAULT 0,   -- comprobaciones en que coincidieron
  distintos INTEGER NOT NULL DEFAULT 0, -- comprobaciones en que no
  comprobado INTEGER,
  PRIMARY KEY (mc, wu)
) WITHOUT ROWID;

-- Avisos de calidad («puede medir mal») de estaciones de otras redes
CREATE TABLE avisos_estacion (
  red TEXT NOT NULL,             -- 'meteoclimatic' | 'wunderground'
  codigo TEXT NOT NULL,
  aviso TEXT NOT NULL,
  detectado INTEGER NOT NULL,
  PRIMARY KEY (red, codigo)
) WITHOUT ROWID;

-- Última vez que se hizo cada tarea periódica
CREATE TABLE tareas (
  nombre TEXT PRIMARY KEY,
  ultima INTEGER NOT NULL
) WITHOUT ROWID;

-- Histórico de Weather Underground de una estación dada de alta (la propia o su gemela): se va trayendo hacia atrás
ALTER TABLE estaciones ADD COLUMN historico_wu TEXT;         -- estación de Weather Underground de la que traerlo
ALTER TABLE estaciones ADD COLUMN historico_pendiente TEXT;  -- siguiente día que falta (hacia atrás); NULL = terminado
ALTER TABLE estaciones ADD COLUMN historico_vacios INTEGER NOT NULL DEFAULT 0; -- días seguidos sin datos

-- Villastar también publica en Weather Underground (IVILLA1897): así el mapa no la enseña dos veces
UPDATE estaciones SET wunderground = 'IVILLA1897' WHERE slug = 'villastar' AND wunderground IS NULL;
