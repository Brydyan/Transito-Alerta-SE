-- 0002_add_postgis_and_geo_zones.sql
-- Transito Alerta SE — PostGIS extension + geo_zones table (T1.2/T1.5)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Confirms
-- proposal open question Q3 (Supabase managed Postgres has PostGIS +
-- GIST-creation privileges) — verify by running this file and checking the
-- CREATE EXTENSION line does not error.
--
-- Rollback: database/rollback/0002_add_postgis_and_geo_zones.DOWN.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

-- geo_zones (design D4 — materialized jurisdiction polygons, containment
-- resolved ONCE at incident write and stored as incidents.zone_id).
-- Geometry type is MultiPolygon (NOT Polygon): Ecuador administrative
-- boundaries (Santa Elena province + cantons) are verified MultiPolygon in
-- the source GeoJSON (ecuador-locations-geom.json, key EC-24).
CREATE TABLE IF NOT EXISTS geo_zones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       varchar(255) NOT NULL,
  polygon    geometry(MultiPolygon, 4326) NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_zones_geom ON geo_zones USING GIST (polygon);

-- Now that geo_zones exists, wire the deferred FK from 0001.
ALTER TABLE organizations
  ADD CONSTRAINT fk_organizations_zone
  FOREIGN KEY (zone_id) REFERENCES geo_zones (id)
  ON DELETE SET NULL;

-- Santa Elena province + 3 cantons seed data.
-- Generated via database/seeds/generate-geo-zones-seed.js from
-- GeoReporta/backend/database/data/ecuador-locations-geom.json (keys EC-24,
-- EC-24-01, EC-24-02, EC-24-03). See
-- database/seeds/0003_seed_geo_zones.generated.sql for the full generated
-- INSERT statements (large — paste that file's contents here, or run it as
-- a separate step immediately after this one).

COMMIT;

-- After COMMIT above, paste + run the contents of:
--   database/seeds/0003_seed_geo_zones.generated.sql
-- (kept as a separate file because it is large — ~600KB of GeoJSON text).
