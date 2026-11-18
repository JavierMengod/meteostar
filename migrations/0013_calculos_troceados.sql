-- Cálculos del histórico por trozos: cada ejecución del Worker en el plan gratuito solo puede usar 10 ms de CPU,
-- así que lo pesado (lo normal de cada día y lo del modelo de previsión) se calcula una sola vez, un trozo por pasada,
-- y se guarda aquí. Las sumas y medias (años, meses, récords) las hace directamente la base de datos.

-- Lo normal de cada día del año hidrológico (0 = 1 de octubre): percentiles del caudal diario en 1991-2020
CREATE TABLE aforo_normal (
  estacion TEXT NOT NULL,
  dia INTEGER NOT NULL,
  p10 REAL,
  p25 REAL,
  p50 REAL,
  p75 REAL,
  p90 REAL,
  PRIMARY KEY (estacion, dia)
) WITHOUT ROWID;

-- Lo calculado del modelo de previsión (JSON):
--   tipo 'correccion', trozo = estación del año (0 dic-feb … 3 sep-nov): {"modelo":[21 cuantiles],"aforo":[21 cuantiles]} o null
--   tipo 'clima', trozo = mes del año hidrológico (0 = octubre): [[día, normal, alto], …] para aforos sin histórico
CREATE TABLE aforo_modelo (
  estacion TEXT NOT NULL,
  tipo TEXT NOT NULL,
  trozo INTEGER NOT NULL,
  datos TEXT,
  PRIMARY KEY (estacion, tipo, trozo)
) WITHOUT ROWID;

-- anuario: 1 si el aforo tiene histórico del Anuario de Aforos (lo pone el script de importación)
-- calculos_hechos: trozos ya calculados, un bit por trozo (0-11 lo normal por mes, 12-15 la corrección por estación,
-- 16-27 lo normal del modelo por mes). El script de importación lo pone a 0 para que se recalcule todo.
ALTER TABLE aforos ADD COLUMN anuario INTEGER NOT NULL DEFAULT 0;
ALTER TABLE aforos ADD COLUMN calculos_hechos INTEGER NOT NULL DEFAULT 0;
UPDATE aforos SET anuario = 1 WHERE EXISTS (SELECT 1 FROM aforo_diario d WHERE d.estacion = aforos.slug AND d.fuente = 'anuario');
