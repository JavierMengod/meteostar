-- Embalses que se muestran en la sección «Embalses» (los elige el administrador).
-- Los datos no se guardan: se leen de la API pública de MapasDeEmbalses.es (boletín semanal
-- del MITECO y, cuando lo hay, dato reciente del SAIH) y se cachean en el Worker.
CREATE TABLE embalses (
  slug TEXT PRIMARY KEY,           -- identificador en mapasdeembalses.es
  orden INTEGER NOT NULL DEFAULT 0,
  creado INTEGER NOT NULL
);

-- Para empezar: los de la cuenca del Turia y los de Teruel
INSERT INTO embalses (slug, orden, creado) VALUES
  ('arquillo-de-san-blas', 1, unixepoch()),
  ('benageber', 2, unixepoch()),
  ('loriguilla', 3, unixepoch()),
  ('calanda', 4, unixepoch()),
  ('canon-de-santolea', 5, unixepoch()),
  ('pena', 6, unixepoch()),
  ('cueva-foradada', 7, unixepoch()),
  ('lechago', 8, unixepoch());
