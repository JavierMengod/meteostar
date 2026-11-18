-- Estaciones de AEMET de la zona (para el mapa): la lista sale del inventario (una vez al mes) y el último dato de
-- cada una se refresca poco a poco (unas cuantas cada 10 minutos; AEMET publica cada hora). No se guarda su histórico
-- salvo que se den de alta.
CREATE TABLE aemet (
  idema TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  provincia TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  alt REAL,
  t INTEGER,          -- hora del último dato (segundos Unix)
  temp REAL,
  hum REAL,
  actualizado INTEGER, -- última vez que se pidió su dato
  visto INTEGER NOT NULL
) WITHOUT ROWID;

-- Indicativo de AEMET de las estaciones de Meteostar que son de AEMET (para no enseñarlas dos veces en el mapa)
ALTER TABLE estaciones ADD COLUMN aemet TEXT;
