-- Rollback for 0003_seed_geo_zones.sql
-- MANUAL EXECUTION ONLY — run in the Supabase SQL editor.

BEGIN;

DELETE FROM geo_zones WHERE id IN (
  '8f14e45f-ceea-4c1f-8f2c-000000000024', -- Santa Elena (Provincia)
  '8f14e45f-ceea-4c1f-8f2c-000000000101', -- Santa Elena (Cantón)
  '8f14e45f-ceea-4c1f-8f2c-000000000102', -- La Libertad
  '8f14e45f-ceea-4c1f-8f2c-000000000103'  -- Salinas
);

COMMIT;
