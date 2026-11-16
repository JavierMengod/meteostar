-- Archivo del radar (RainViewer) de la zona de la red, para poder ver hasta 24 horas atrás.
-- RainViewer solo publica las 2 últimas horas; guardamos las teselas de nuestra zona (zoom 6 y 7).
CREATE TABLE radar_teselas (
  t INTEGER NOT NULL,     -- instante de la imagen (segundos Unix)
  z INTEGER NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  png BLOB NOT NULL,
  PRIMARY KEY (t, z, x, y)
) WITHOUT ROWID;
