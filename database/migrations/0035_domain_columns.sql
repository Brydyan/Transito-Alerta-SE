-- T7.6 — columnas de dominio faltantes (design.md D7.6, spec R12/R13):
-- `geo_zones.code` (código administrativo, para import/export y matching
-- externo) y `users.phone` (presente en legacy desde create_users_table).

BEGIN;

ALTER TABLE geo_zones
  ADD COLUMN IF NOT EXISTS code varchar(32) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_zones_code
  ON geo_zones (code) WHERE code IS NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone varchar(30) NULL;

COMMIT;
