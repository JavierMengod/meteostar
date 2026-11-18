-- Medias del día: suma y número de lecturas de temperatura y de viento (media = suma / n).
ALTER TABLE resumen_diario ADD COLUMN temp_suma REAL;
ALTER TABLE resumen_diario ADD COLUMN temp_n INTEGER;
ALTER TABLE resumen_diario ADD COLUMN viento_suma REAL;
ALTER TABLE resumen_diario ADD COLUMN viento_n INTEGER;
