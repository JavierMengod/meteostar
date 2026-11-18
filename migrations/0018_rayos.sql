-- Sensor de rayos (Ecowitt WH57): rayos detectados hoy, distancia del último y hora del último.
ALTER TABLE lecturas ADD COLUMN rayos INTEGER;
ALTER TABLE lecturas ADD COLUMN rayos_dist REAL;
ALTER TABLE lecturas ADD COLUMN rayos_ts INTEGER;
-- Rayos del día (el contador de la consola es diario: se guarda el más alto)
ALTER TABLE resumen_diario ADD COLUMN rayos INTEGER;
