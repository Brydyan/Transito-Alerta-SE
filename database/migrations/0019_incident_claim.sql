-- 0019_incident_claim.sql
-- Transito Alerta SE — T5.1: operator claim/release workflow.
-- MANUAL EXECUTION ONLY. Requires 0009 (permissions table) applied first.
-- Rollback: database/rollback/0019_incident_claim.DOWN.sql

BEGIN;

-- Extend the existing CHECK constraint on permissions.action to admit
-- CLAIM and RELEASE. NestJS PermissionAction union is updated in lockstep
-- in src/common/decorators/require-permission.decorator.ts.
ALTER TABLE permissions
  DROP CONSTRAINT IF EXISTS permissions_action_check;

ALTER TABLE permissions
  ADD CONSTRAINT permissions_action_check
  CHECK (action IN ('READ', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'CLAIM', 'RELEASE'));

-- 1) Add claimed_by to incidents.
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_claimed_by ON incidents (claimed_by)
  WHERE claimed_by IS NOT NULL;

-- 2) Add max_active_claims to organizations.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS max_active_claims int NOT NULL DEFAULT 5
  CHECK (max_active_claims > 0);

-- 3) Seed the two new permission rows.
INSERT INTO permissions (resource, action) VALUES
  ('incidents', 'CLAIM'),
  ('incidents', 'RELEASE')
ON CONFLICT (resource, action) DO NOTHING;

-- 4) Grant both to operator roles via the JSONB permissions column
--    (the same pattern 0018 uses for invitation permissions — the project
--    has no `role_permissions` table; AuthService reads the JSONB column).
UPDATE roles
   SET permissions = permissions || jsonb_build_array('CLAIM incidents', 'RELEASE incidents')
 WHERE name IN ('operador_organizacion', 'operador_sistema')
   AND NOT (permissions ?& array['CLAIM incidents', 'RELEASE incidents']);

COMMIT;
