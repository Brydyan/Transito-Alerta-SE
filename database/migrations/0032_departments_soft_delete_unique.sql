-- 0032_departments_soft_delete_unique.sql
-- Replace the plain UNIQUE constraint on (organization_id, name) with a
-- partial unique index that ignores soft-deleted rows. Without this fix,
-- soft-deleting a department permanently blocks re-creation of the same
-- name inside the same organization.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0030 (departments table + uq_departments_org_name constraint).
--
-- Rollback: database/rollback/0032_departments_soft_delete_unique.DOWN.sql

BEGIN;

-- Drop the plain constraint (covers all rows including soft-deleted).
ALTER TABLE departments
  DROP CONSTRAINT IF EXISTS uq_departments_org_name;

-- Partial unique index: only enforces uniqueness among active (non-deleted) rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_org_name_active
  ON departments (organization_id, name)
  WHERE deleted_at IS NULL;

COMMIT;
