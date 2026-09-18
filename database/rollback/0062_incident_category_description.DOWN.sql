-- 0062_incident_category_description.DOWN.sql
-- Rollback for 0062_incident_category_description.sql.
-- Drops the description column. WARNING: any data in description is lost.

BEGIN;

ALTER TABLE incident_categories
  DROP COLUMN IF EXISTS description;

COMMIT;