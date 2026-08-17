-- database/rollback/0015_organizations_scoping.DOWN.sql
-- T3.2: Rollback organizations scoping — drop incidents.organization_id +
-- indexes, delete the four seeded staff roles and the 'organizations'
-- permission catalog rows.
--
-- Organization ROWS themselves are never touched by this migration (0015
-- inserts none) — only the incidents column and the seeded roles/perms
-- introduced here go away.

BEGIN;

DELETE FROM roles WHERE name IN (
  'admin_sistema', 'operador_sistema', 'admin_organizacion', 'operador_organizacion'
);

DELETE FROM permissions WHERE resource = 'organizations';

DROP INDEX IF EXISTS idx_incidents_org_created;

ALTER TABLE incidents DROP COLUMN IF EXISTS organization_id;

DROP INDEX IF EXISTS uq_organizations_zone;

COMMIT;
