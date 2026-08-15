-- 0004_incidents.sql
-- Transito Alerta SE — incidents table (T2.1)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires
-- 0001 (users) and 0002 (postgis + geo_zones) to have been applied first.
--
-- NOTE: tasks.md originally called this file 0003_incidents.sql, but
-- 0001-0003 were already taken by initial_schema / postgis+geo_zones /
-- seed_geo_zones (T1.2/T1.5). Renumbered to 0004 here; see
-- apply-progress for the reconciliation note.
--
-- Rollback: database/rollback/0004_incidents.DOWN.sql

BEGIN;

-- location is a Point (SRID 4326) — NOT the MultiPolygon used by geo_zones.
-- zone_id/geofence_matched are resolved ONCE at write time via
-- GeofencingService.resolveZone (design D4); an incident outside all zones
-- still persists with zone_id=null, geofence_matched=false (spec R2).
CREATE TABLE IF NOT EXISTS incidents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            varchar(255) NOT NULL,
  description      text,
  location         geometry(Point, 4326) NOT NULL,
  status           varchar(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'in_progress', 'resolved')),
  priority         varchar(20) NOT NULL DEFAULT 'medium'
                     CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  citizen_id       uuid NOT NULL REFERENCES users (id),
  assigned_to      uuid REFERENCES users (id),
  zone_id          uuid REFERENCES geo_zones (id) ON DELETE SET NULL,
  geofence_matched boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_zone ON incidents (zone_id, status);

COMMIT;
