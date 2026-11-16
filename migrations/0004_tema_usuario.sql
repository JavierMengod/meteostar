-- Tema de la web elegido por cada usuario: 'auto' (el del sistema), 'claro' u 'oscuro'
ALTER TABLE usuarios ADD COLUMN tema TEXT NOT NULL DEFAULT 'auto';
