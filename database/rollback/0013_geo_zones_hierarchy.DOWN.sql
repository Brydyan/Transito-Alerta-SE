-- database/rollback/0013_geo_zones_hierarchy.DOWN.sql
-- T3.8: Rollback geo_zones.parent_id/level + indexes + 'geo-zones' permissions.
--
-- Zone ROWS are never removed — including zones created through the T3.8 API.
-- Only the hierarchy columns go away; id/name/polygon/active survive, so
-- geofencing keeps working exactly as it did before 0013.

BEGIN;

DELETE FROM permissions WHERE resource = 'geo-zones';

DROP INDEX IF EXISTS idx_geo_zones_level;
DROP INDEX IF EXISTS idx_geo_zones_parent_id;

ALTER TABLE geo_zones DROP CONSTRAINT IF EXISTS chk_geo_zones_parent_not_self;
ALTER TABLE geo_zones DROP CONSTRAINT IF EXISTS chk_geo_zones_level;

ALTER TABLE geo_zones DROP COLUMN IF EXISTS level;
ALTER TABLE geo_zones DROP COLUMN IF EXISTS parent_id;

COMMIT;
