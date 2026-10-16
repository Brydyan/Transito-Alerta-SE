-- 0032_departments_soft_delete_unique.DOWN.sql
-- Reverts 0032: restores the plain UNIQUE constraint and drops the partial index.

BEGIN;

DROP INDEX IF EXISTS uq_departments_org_name_active;

ALTER TABLE departments
  ADD CONSTRAINT uq_departments_org_name UNIQUE (organization_id, name);

COMMIT;
