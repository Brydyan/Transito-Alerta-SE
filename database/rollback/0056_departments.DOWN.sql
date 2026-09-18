-- Rollback 0056: drop departments module schema
-- Transito Alerta SE — `back/2026-09-15-departments-module`
--
-- Reverse order of 0056_up.sql:
--   1. Drop partial index on incidents(department_id)
--   2. Drop department_id column on incidents
--   3. Drop partial index on users(department_id)
--   4. Drop department_id column on users
--   5. Drop supporting index on departments
--   6. Drop departments table (CASCADE removes the org FK; SET NULL
--      columns on users/incidents are gone before this point)
--
-- Requires 0057 rollback to have run first (so no permission rows
-- reference "departments" and the FKs are not needed for read paths).

BEGIN;

-- 1) Drop incidents partial index
DROP INDEX IF EXISTS idx_incidents_department;

-- 2) Drop incidents.department_id
ALTER TABLE incidents DROP COLUMN IF EXISTS department_id;

-- 3) Drop users partial index
DROP INDEX IF EXISTS idx_users_department;

-- 4) Drop users.department_id
ALTER TABLE users DROP COLUMN IF EXISTS department_id;

-- 5) Drop departments supporting index
DROP INDEX IF EXISTS idx_departments_org_deleted;

-- 6) Drop departments table (CASCADE in case any leftover FK points here)
DROP TABLE IF EXISTS departments CASCADE;

COMMIT;
