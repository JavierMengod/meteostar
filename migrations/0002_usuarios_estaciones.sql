-- Meteostar: usuarios, varias estaciones por usuario, estaciones oficiales y ubicaciones de previsión.

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT NOT NULL,
  hash TEXT NOT NULL,              -- PBKDF2-SHA256 de la contraseña
  sal TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'usuario',  -- 'usuario' | 'admin'
  creado INTEGER NOT NULL
);

CREATE TABLE invitaciones (
  codigo TEXT PRIMARY KEY,
  email TEXT,                      -- opcional: solo vale para ese email
  nota TEXT,
  creada INTEGER NOT NULL,
  creada_por INTEGER REFERENCES usuarios(id),
  caduca INTEGER NOT NULL,
  usada_por INTEGER REFERENCES usuarios(id),
  usada INTEGER
);

CREATE TABLE sesiones (
  id TEXT PRIMARY KEY,             -- SHA-256 del identificador de la cookie
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  caduca INTEGER NOT NULL
);

CREATE TABLE estaciones (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,       -- para la URL: /estacion/villastar
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'particular',  -- 'particular' | 'oficial'
  red TEXT,                        -- p. ej. 'AEMET', 'Meteoclimatic'
  nombre TEXT NOT NULL,
  municipio TEXT NOT NULL,
  provincia TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  altitud REAL NOT NULL,
  descripcion TEXT,
  equipo TEXT,
  meteoclimatic TEXT,              -- código de la estación en Meteoclimatic, si publica allí
  fuente TEXT NOT NULL,            -- conector: 'directo' | 'ecowitt_api' | 'wunderground' | 'meteoclimatic' | 'aemet'
  config TEXT,                     -- configuración del conector (JSON cifrado si lleva claves)
  token TEXT UNIQUE,               -- clave de envío directo
  publica INTEGER NOT NULL DEFAULT 1,
  activa INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  creada INTEGER NOT NULL,
  ultima_consulta INTEGER,         -- última vez que el cron leyó el conector
  ultimo_error TEXT
);

CREATE TABLE ubicaciones (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  altitud REAL NOT NULL,
  creada INTEGER NOT NULL
);
CREATE INDEX ubicaciones_usuario ON ubicaciones(usuario_id);

-- La estación de Villastar existente pasa a ser la estación 1 (se asignará al primer administrador)
INSERT INTO estaciones (id, slug, nombre, municipio, provincia, lat, lon, altitud, equipo, fuente, token, creada)
VALUES (1, 'villastar', 'Villastar', 'Villastar', 'Teruel', 40.284, -1.158, 935,
        'Ecowitt HP2560 + WS69', 'directo', lower(hex(randomblob(16))), unixepoch());

-- Lecturas y resúmenes pasan a ser por estación
CREATE TABLE lecturas_nueva (
  estacion_id INTEGER NOT NULL REFERENCES estaciones(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  fuente TEXT NOT NULL,
  temp REAL, hum REAL, rocio REAL, sensacion REAL, presion REAL, presion_abs REAL,
  viento REAL, racha REAL, dir INTEGER, lluvia_dia REAL, intensidad REAL,
  radiacion REAL, uv REAL, temp_int REAL, hum_int REAL,
  PRIMARY KEY (estacion_id, ts)
) WITHOUT ROWID;
INSERT INTO lecturas_nueva SELECT 1, * FROM lecturas;
DROP TABLE lecturas;
ALTER TABLE lecturas_nueva RENAME TO lecturas;

CREATE TABLE resumen_nuevo (
  estacion_id INTEGER NOT NULL REFERENCES estaciones(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  tmax REAL, tmax_ts INTEGER,
  tmin REAL, tmin_ts INTEGER,
  hum_max REAL, hum_min REAL,
  presion_max REAL, presion_min REAL,
  viento_max REAL,
  racha_max REAL, racha_max_ts INTEGER,
  lluvia REAL,
  intensidad_max REAL, intensidad_max_ts INTEGER,
  radiacion_max REAL,
  uv_max REAL,
  lecturas INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (estacion_id, fecha)
) WITHOUT ROWID;
INSERT INTO resumen_nuevo SELECT 1, * FROM resumen_diario;
DROP TABLE resumen_diario;
ALTER TABLE resumen_nuevo RENAME TO resumen_diario;
