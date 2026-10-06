-- 0065_incident_category_priority.DOWN.sql
-- Rollback for 0065_incident_category_priority.sql.
-- Drops the priority column. WARNING: any data in priority is lost.

BEGIN;

ALTER TABLE incident_categories
  DROP COLUMN IF EXISTS priority;

COMMIT;
