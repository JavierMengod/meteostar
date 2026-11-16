-- Lecturas de los aforos de río (Observatorio del Agua GOTA, MITECO). El servicio solo da 7 días de una vez,
-- así que se guardan aquí cada 10 minutos para tener un histórico propio.
CREATE TABLE aforo_lecturas (
  estacion TEXT NOT NULL,          -- id del aforo en Meteostar (p. ej. turia-teruel)
  t INTEGER NOT NULL,              -- instante de la lectura (segundos Unix)
  caudal REAL,                     -- m³/s
  nivel REAL,                      -- m
  PRIMARY KEY (estacion, t)
) WITHOUT ROWID;
