-- T7.6 — rollback de columnas de dominio faltantes

BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS phone;

DROP INDEX IF EXISTS uq_geo_zones_code;
ALTER TABLE geo_zones DROP COLUMN IF EXISTS code;

COMMIT;
