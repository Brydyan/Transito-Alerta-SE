-- Rollback for 0002_add_postgis_and_geo_zones.sql
-- MANUAL EXECUTION ONLY — run in the Supabase SQL editor.
-- Run 0003's rollback (drop geo_zones rows) BEFORE this, or simply let the
-- DROP TABLE CASCADE remove the seeded rows along with the table.

BEGIN;

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS fk_organizations_zone;
DROP TABLE IF EXISTS geo_zones;
-- NOTE: does not DROP EXTENSION postgis — other tables/extensions may
-- depend on it; drop manually only if you are certain nothing else uses it.

COMMIT;
