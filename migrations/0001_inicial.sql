-- Lecturas al minuto (se conservan 8 días)
CREATE TABLE lecturas (
  ts INTEGER PRIMARY KEY,          -- segundos Unix (UTC), redondeado al minuto
  fuente TEXT NOT NULL,            -- 'push' (consola) o 'api' (Ecowitt.net)
  temp REAL,                       -- °C
  hum REAL,                        -- %
  rocio REAL,                      -- °C
  sensacion REAL,                  -- °C
  presion REAL,                    -- hPa (relativa)
  presion_abs REAL,                -- hPa (absoluta)
  viento REAL,                     -- km/h
  racha REAL,                      -- km/h
  dir INTEGER,                     -- grados
  lluvia_dia REAL,                 -- mm acumulados del día
  intensidad REAL,                 -- mm/h
  radiacion REAL,                  -- W/m²
  uv REAL,
  temp_int REAL,
  hum_int REAL
);

-- Resumen diario (fecha local Europe/Madrid), se conserva siempre
CREATE TABLE resumen_diario (
  fecha TEXT PRIMARY KEY,          -- YYYY-MM-DD
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
  lecturas INTEGER NOT NULL DEFAULT 0
);
