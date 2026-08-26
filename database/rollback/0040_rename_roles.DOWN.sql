-- Rollback T7.2.B — Rename roles back to original names
BEGIN;

UPDATE roles SET name = 'admin_sistema' WHERE name = 'master';
UPDATE roles SET name = 'admin_organizacion' WHERE name = 'admin_org';
UPDATE roles SET name = 'operador_organizacion' WHERE name = 'operador_org';

COMMIT;
