-- Aforos de río que muestra Meteostar (se añaden y quitan desde Administración).
-- Los datos en tiempo real vienen del Observatorio del Agua (MITECO); «elemento» es su identificador allí.
CREATE TABLE aforos (
  slug TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,            -- p. ej. «Turia en Teruel»
  rio TEXT NOT NULL,
  codigo TEXT,                     -- código de la estación de aforo (ROEA), p. ej. 08015
  elemento TEXT NOT NULL UNIQUE,
  confederacion TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  embalse TEXT,                    -- embalse que regula el río aguas arriba (slug de mapasdeembalses.es), opcional
  regulado_desde INTEGER,          -- año desde el que está regulado (para separar los récords), opcional
  umbrales TEXT,                   -- umbrales de aviso de la confederación (JSON, m³/s), se actualizan solos
  celda_lat REAL,                  -- celda del modelo GloFAS que sigue el cauce (se busca sola)
  celda_lon REAL,
  orden INTEGER NOT NULL DEFAULT 0,
  creado INTEGER NOT NULL
);

INSERT INTO aforos (slug, nombre, rio, codigo, elemento, confederacion, lat, lon, embalse, regulado_desde, umbrales, celda_lat, celda_lon, orden, creado) VALUES
  ('turia-teruel', 'Turia en Teruel', 'Turia', '08015', '01961577-5958-7eda-a917-32b3c145c9c6', 'Júcar', 40.343, -1.1113,
   'arquillo-de-san-blas', 1962, '[20,40,50]', NULL, NULL, 1, unixepoch()),
  ('alfambra-teruel', 'Alfambra en Teruel', 'Alfambra', '08027', '01961577-5988-78d8-adea-7fb39f1a6f9f', 'Júcar', 40.3571, -1.1214,
   NULL, NULL, NULL, NULL, NULL, 2, unixepoch());
