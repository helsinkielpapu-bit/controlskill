-- DA-20: revocación de sesiones. Cada token lleva la versión de sesión del usuario;
-- al cerrar sesión la versión sube y los tokens anteriores dejan de valer.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
