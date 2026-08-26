-- T7.1 Fase C — rollback de la tabla de tracking
--
-- Elimina schema_migrations. Idempotente: IF EXISTS evita error
-- si se ejecuta dos veces o si nunca fue aplicada.

BEGIN;

DROP TABLE IF EXISTS schema_migrations;

COMMIT;
