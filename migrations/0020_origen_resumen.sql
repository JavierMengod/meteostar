-- De dónde sale el resumen de un día: NULL = de las lecturas de la estación; 'hoja' = importado de una hoja de cálculo
-- (solo extremos del día, sin hora ni humedad, presión, radiación…).
ALTER TABLE resumen_diario ADD COLUMN origen TEXT;
