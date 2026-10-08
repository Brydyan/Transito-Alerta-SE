-- 0065_incident_category_priority.sql
-- 2026-09-22-sc-subcategory-priority-assignment
-- Add `priority` column to incident_categories so admins can assign a
-- default priority to sub-categories. When a citizen publishes an
-- incident and picks a sub-category, this priority pre-fills the
-- incident priority field (citizen can still override).
--
-- Design D1/D4 (sub-categories only): the column is NULL-able
-- everywhere; the service layer enforces that sub-categories
-- (`parent_id IS NOT NULL`) carry a non-NULL priority. Existing root
-- and sub categories keep NULL — backward compatible, no backfill.
--
-- Requires: 0012 (incident_categories), 0031 (soft delete),
--           0058 (department_incident_categories junction),
--           0062 (description).
--
-- DOWN: database/rollback/0065_incident_category_priority.DOWN.sql
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

ALTER TABLE incident_categories
  ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NULL;

-- Comment for posterity — surfaces in pg_catalog and IDEs.
COMMENT ON COLUMN incident_categories.priority IS
  'Default priority for incidents filed under this sub-category. '
  'NULL on root categories. Application enforces non-NULL on subs.';

COMMIT;
