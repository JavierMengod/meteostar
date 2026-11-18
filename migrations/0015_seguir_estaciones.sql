-- Estaciones: la que se ve por defecto (sin cuenta) y las que sigue cada usuario, igual que ríos y embalses.
ALTER TABLE estaciones ADD COLUMN destacado INTEGER NOT NULL DEFAULT 0;
UPDATE estaciones SET destacado = 1 WHERE slug = 'villastar';

-- favoritos admite ahora también estaciones (la restricción CHECK no se puede cambiar: se rehace la tabla)
CREATE TABLE favoritos_nueva (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('rio', 'embalse', 'estacion')),
  slug TEXT NOT NULL,
  creado INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, tipo, slug)
) WITHOUT ROWID;
INSERT INTO favoritos_nueva SELECT usuario_id, tipo, slug, creado FROM favoritos;
DROP TABLE favoritos;
ALTER TABLE favoritos_nueva RENAME TO favoritos;
