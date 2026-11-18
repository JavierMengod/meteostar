-- Weather Underground: estaciones de la zona (la lista se pide una vez al día; solo ficha, sin datos),
-- cupo diario de peticiones de la clave y código de cada estación de Meteostar que sea de Weather Underground.
CREATE TABLE wunderground (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  visto INTEGER NOT NULL
) WITHOUT ROWID;

-- Peticiones gastadas cada día por servicio (para no pasar del límite de la clave)
CREATE TABLE cupo (
  fecha TEXT NOT NULL,
  servicio TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (fecha, servicio)
) WITHOUT ROWID;

ALTER TABLE estaciones ADD COLUMN wunderground TEXT;
