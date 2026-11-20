-- Gestión de usuarios: cuentas desactivadas, último acceso y freno a los intentos de entrar a ciegas.
ALTER TABLE usuarios ADD COLUMN activo INTEGER NOT NULL DEFAULT 1;  -- 0: no puede entrar (sus estaciones siguen)
ALTER TABLE usuarios ADD COLUMN ultimo_acceso INTEGER;             -- última vez que entró (segundos Unix)

-- Intentos fallidos de entrar, por email: tras 10 en 15 minutos, ese email queda bloqueado 15 minutos
CREATE TABLE intentos_acceso (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  fallos INTEGER NOT NULL,
  desde INTEGER NOT NULL,        -- primer fallo de la racha
  bloqueado_hasta INTEGER
) WITHOUT ROWID;
