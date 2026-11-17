-- Lo que se ve por defecto (sin cuenta) y lo que elige cada usuario.
ALTER TABLE aforos ADD COLUMN destacado INTEGER NOT NULL DEFAULT 0;
ALTER TABLE embalses ADD COLUMN destacado INTEGER NOT NULL DEFAULT 0;
UPDATE aforos SET destacado = 1 WHERE slug = 'turia-teruel';
UPDATE embalses SET destacado = 1 WHERE slug = 'arquillo-de-san-blas';

-- Última lectura de cada aforo, para que la portada de Ríos lea una sola fila por río
-- (se actualiza con cada lectura; la minigráfica son las últimas 48 h, una lectura por hora).
ALTER TABLE aforos ADD COLUMN ultimo_t INTEGER;
ALTER TABLE aforos ADD COLUMN ultimo_caudal REAL;
ALTER TABLE aforos ADD COLUMN ultimo_nivel REAL;
ALTER TABLE aforos ADD COLUMN tendencia REAL;
ALTER TABLE aforos ADD COLUMN mini TEXT;
ALTER TABLE aforos ADD COLUMN normal_hoy TEXT;   -- percentiles de lo normal para hoy (JSON), del resumen diario
ALTER TABLE aforos ADD COLUMN leido INTEGER;     -- última vez que se pidieron sus lecturas al Observatorio

-- Ríos y embalses que sigue cada usuario
CREATE TABLE favoritos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('rio', 'embalse')),
  slug TEXT NOT NULL,
  creado INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, tipo, slug)
) WITHOUT ROWID;
