-- 0040_rename_roles.sql
-- Transito Alerta SE — Rename roles for clarity (T7.2 app-level)
--
-- Renames:
-- - admin_sistema → master
-- - admin_organizacion → admin_org
-- - operador_organizacion → operador_org
-- operador_sistema unchanged (global read-only operator)
-- reporter unchanged (citizen reporter)
--
-- Idempotent: only affects rows with old names.
-- Rollback: database/rollback/0040_rename_roles.DOWN.sql

BEGIN;

UPDATE roles SET name = 'master' WHERE name = 'admin_sistema';
UPDATE roles SET name = 'admin_org' WHERE name = 'admin_organizacion';
UPDATE roles SET name = 'operador_org' WHERE name = 'operador_organizacion';

COMMIT;
