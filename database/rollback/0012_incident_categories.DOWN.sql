-- database/rollback/0012_incident_categories.DOWN.sql
-- T3.7: Rollback incident_categories + incidents.category_id + permission seeds

DELETE FROM permissions WHERE resource = 'incident-categories';

DROP INDEX IF EXISTS idx_incidents_category_id;
ALTER TABLE incidents DROP COLUMN IF EXISTS category_id;

DROP INDEX IF EXISTS idx_incident_categories_parent_id;
DROP TABLE IF EXISTS incident_categories;
