-- Histórico diario de los aforos: Anuario de Aforos (MITECO / CEDEX) y, desde que Meteostar guarda lecturas,
-- la media de cada día calculada con ellas. Los datos del anuario se cargan con datos/anuario-aforos.sql.
CREATE TABLE aforo_diario (
  estacion TEXT NOT NULL,
  fecha TEXT NOT NULL,             -- AAAA-MM-DD
  caudal REAL,                     -- caudal medio del día (m³/s)
  nivel REAL,                      -- altura media del día (m)
  fuente TEXT NOT NULL,            -- 'anuario' (validado) o 'medido' (media de las lecturas en tiempo real)
  PRIMARY KEY (estacion, fecha)
) WITHOUT ROWID;

-- Caudal máximo instantáneo de cada mes (anuario): sirve para los récords de crecidas
CREATE TABLE aforo_max_mensual (
  estacion TEXT NOT NULL,
  mes TEXT NOT NULL,               -- AAAA-MM
  dia INTEGER,
  caudal REAL NOT NULL,
  PRIMARY KEY (estacion, mes)
) WITHOUT ROWID;

-- Resumen precalculado una vez al día (lo normal, años, meses y récords), para no recorrer el histórico en cada visita
CREATE TABLE aforo_resumen (
  estacion TEXT PRIMARY KEY,
  datos TEXT NOT NULL,             -- JSON
  actualizado INTEGER NOT NULL
);
