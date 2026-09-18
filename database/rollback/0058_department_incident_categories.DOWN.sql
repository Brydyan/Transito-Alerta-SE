-- Rollback 0058: drop department_incident_categories M:N table
-- Transito Alerta SE — sibling of `back/2026-09-15-departments-module` /
-- `front/2026-09-15-departments-menu`.
--
-- Reverse order of 0058_up.sql: drop the reverse-side index, then the
-- table. The composite PK is dropped implicitly with the table.

BEGIN;

DROP INDEX IF EXISTS idx_dic_category;

DROP TABLE IF EXISTS department_incident_categories CASCADE;

COMMIT;
