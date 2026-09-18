-- 0062_incident_category_description.sql
-- T7.4 / sc-334-adjacent — add `description` column to incident_categories
-- so the create form can show a description input alongside the name.
-- Backwards compatible: existing rows get NULL.
--
-- Requires: 0012 (incident_categories), 0031 (soft delete),
--           0058 (department_incident_categories junction).
--
-- DOWN: database/rollback/0062_incident_category_description.DOWN.sql
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.

BEGIN;

ALTER TABLE incident_categories
  ADD COLUMN IF NOT EXISTS description text NULL;

-- Comment for posterity — surfaces in pg_catalog and IDEs.
COMMENT ON COLUMN incident_categories.description IS
  'Optional free-text description. NOT exposed via /api/menus/my or /api/incidents. '
  'Read by /api/incident-categories/{id} responses and surfaced in the admin form.';

COMMIT;