-- Embalses: el estado de cada uno se guarda en la base de datos y lo refresca la tarea de los aforos, uno por pasada
-- (así la página no hace decenas de peticiones a MapasDeEmbalses.es, y no se pasa del límite del plan gratuito).
ALTER TABLE embalses ADD COLUMN datos TEXT;
ALTER TABLE embalses ADD COLUMN actualizado INTEGER;

-- Más embalses de Teruel con datos: los del boletín semanal y, Gallipuén y Valcomuna, solo con el dato del SAIH Ebro
INSERT OR IGNORE INTO embalses (slug, orden, creado) VALUES
  ('santolea', 9, unixepoch()),
  ('puente-de-santolea', 10, unixepoch()),
  ('alcaniz-estanca', 11, unixepoch()),
  ('parras-las', 12, unixepoch()),
  ('gallipuen', 13, unixepoch()),
  ('valcomuna', 14, unixepoch());
