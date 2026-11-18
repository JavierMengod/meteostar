-- Estaciones de Meteoclimatic vistas en el feed de la provincia (solo su ficha y su último dato, no el histórico).
-- El feed de una provincia solo trae las que han enviado datos hace poco: las que envían cada hora entran y salen.
-- Guardándolas aquí, el mapa las enseña siempre (con su último dato y cuándo fue).
CREATE TABLE meteoclimatic (
  codigo TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  nombre TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  t INTEGER,          -- último dato (segundos Unix)
  temp REAL,
  qos INTEGER,
  visto INTEGER NOT NULL  -- última vez que salió en el feed
) WITHOUT ROWID;
CREATE INDEX meteoclimatic_region ON meteoclimatic (region);
