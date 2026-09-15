-- 0058_geo_zones_reporter_permission.sql
-- Grant READ geo-zones permission to reporter role.
--
-- The map component (`frontend/src/app/features/citizen/map/map.component.ts`)
-- loads zones via geoZoneService.listAll() to display boundaries on the map.
-- These are reference data, not sensitive. Reporter role needs READ geo-zones
-- to access the standalone map at /app/mapa (similar to READ incident-categories
-- for category selection in /app/reportar).
--
-- Before: reporter could not load geo-zones boundaries → map loads silently
-- fails (Leaflet renders empty map, no boundary overlays).
--
-- After: reporter can load geo-zones → map displays boundaries correctly.
--
-- Idempotent: uses ON CONFLICT DO NOTHING on permissions insert (already exists
-- from migration 0013), and conditional UPDATE on roles.permissions with
-- COALESCE/jsonb_agg deduplication (follows pattern from 0052.DOWN).
--
-- Rollback: database/rollback/0058_geo_zones_reporter_permission.DOWN.sql

BEGIN;

-- Permission already exists in catalog (migration 0013), but ensure it's present
-- in case this migration runs on a database with partial history.
INSERT INTO permissions (resource, action) VALUES
  ('geo-zones', 'READ')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant to reporter role. JSONB concat with deduplication.
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND p.resource = 'geo-zones'
           AND p.action = 'READ')
     ) AS elem
   )
 WHERE r.name = 'reporter'
   AND r.deleted_at IS NULL;

-- Denormalize to users.permissions of active reporters.
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'reporter'
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

COMMIT;
