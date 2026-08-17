-- 0013_geo_zones_hierarchy.sql
-- Transito Alerta SE — geo_zones hierarchy + admin CRUD permissions (T3.8)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
--
-- Adds the adjacency-list hierarchy (parent_id/level) that the seeded
-- Santa Elena rows have always had implicitly, plus the permission catalog
-- rows for resource 'geo-zones'. Does NOT touch id/name/polygon/active.
--
-- Rollback: database/rollback/0013_geo_zones_hierarchy.DOWN.sql

BEGIN;

-- 1. Columns -----------------------------------------------------------------
ALTER TABLE geo_zones
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES geo_zones (id) ON DELETE SET NULL;

ALTER TABLE geo_zones
  ADD COLUMN IF NOT EXISTS level varchar(20) NOT NULL DEFAULT 'zona';

-- 2. Constraints (PG has no ADD CONSTRAINT IF NOT EXISTS — design D12) -------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_geo_zones_level') THEN
    ALTER TABLE geo_zones
      ADD CONSTRAINT chk_geo_zones_level
      CHECK (level IN ('provincia', 'canton', 'parroquia', 'zona'));
  END IF;
END $$;

-- Depth-1 backstop only. Transitive cycles are caught by the application's
-- ancestor walk (design D4) — this CHECK cannot see them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_geo_zones_parent_not_self') THEN
    ALTER TABLE geo_zones
      ADD CONSTRAINT chk_geo_zones_parent_not_self
      CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;

-- 3. Indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_geo_zones_parent_id ON geo_zones (parent_id);
CREATE INDEX IF NOT EXISTS idx_geo_zones_level     ON geo_zones (level);

-- 4. Seed backfill (design D5 of the proposal) --------------------------------
-- Matched by the DETERMINISTIC UUIDs assigned in
-- database/seeds/generate-geo-zones-seed.js:33-38 — NEVER by name:
-- 'Santa Elena (Provincia)' and 'Santa Elena (Cantón)' both start with
-- "Santa Elena" and a LIKE/prefix match would mis-parent the canton to itself.
-- Every statement is a guarded UPDATE: on a database where the geo-zones seed
-- was never applied, all four match zero rows and the migration still succeeds.

UPDATE geo_zones
   SET level = 'provincia', parent_id = NULL
 WHERE id = '8f14e45f-ceea-4c1f-8f2c-000000000024';   -- EC-24  Santa Elena (Provincia)

-- The EXISTS guard keeps this a no-op (instead of an FK violation) on a
-- database that somehow has the cantons but not the province row.
UPDATE geo_zones
   SET level = 'canton', parent_id = '8f14e45f-ceea-4c1f-8f2c-000000000024'
 WHERE id IN (
         '8f14e45f-ceea-4c1f-8f2c-000000000101',      -- EC-24-01 Santa Elena (Cantón)
         '8f14e45f-ceea-4c1f-8f2c-000000000102',      -- EC-24-02 La Libertad
         '8f14e45f-ceea-4c1f-8f2c-000000000103'       -- EC-24-03 Salinas
       )
   AND EXISTS (
         SELECT 1 FROM geo_zones p
          WHERE p.id = '8f14e45f-ceea-4c1f-8f2c-000000000024'
       );

-- 5. Permission catalog ------------------------------------------------------
-- Resource is the HYPHENATED 'geo-zones', matching PermissionGuard's
-- inferResourceFromPath off the real route segment (/api/geo-zones/...).
-- Informational catalog row — the guard compares the flat "ACTION resource"
-- string on the caller's own permission set — but it must match exactly or
-- nothing here is ever grantable.
INSERT INTO permissions (resource, action) VALUES
  ('geo-zones', 'READ'),
  ('geo-zones', 'CREATE'),
  ('geo-zones', 'UPDATE'),
  ('geo-zones', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

COMMIT;
