-- 0043_incident_close_permission.sql
-- Transito Alerta SE — sc-315 (fix-incident-state-machine): grant `CLOSE incidents`
-- as a distinct permission, separate from `UPDATE incidents`.
--
-- Rationale (D8 del design): resolver y cerrar no son la misma acción. Hoy
-- comparten `UPDATE incidents`, así que cualquier `operador_org` con UPDATE
-- puede dar de baja el reporte de un ciudadano. Esta migración rompe esa
-- equivalencia: cerrar exige `CLOSE incidents`, exclusivo de `master` y
-- `admin_org`.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires
-- 0009 (permissions table), 0019 (CHECK allows CLAIM/RELEASE) y
-- 0040_rename_roles (nombres `master` y `admin_org` consolidados).
--
-- Rollback: database/rollback/0043_incident_close_permission.DOWN.sql

BEGIN;

-- 1) Extend the CHECK constraint on permissions.action to admit CLOSE.
--    NestJS PermissionAction union is updated in lockstep in
--    src/common/decorators/require-permission.decorator.ts.
ALTER TABLE permissions
  DROP CONSTRAINT IF EXISTS permissions_action_check;

ALTER TABLE permissions
  ADD CONSTRAINT permissions_action_check
  CHECK (action IN ('READ', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'CLAIM', 'RELEASE', 'CLOSE'));

-- 2) Register the (incidents, CLOSE) permission row.
INSERT INTO permissions (resource, action) VALUES
  ('incidents', 'CLOSE')
ON CONFLICT (resource, action) DO NOTHING;

-- 3) Grant `CLOSE incidents` to master and admin_org via roles.permissions JSONB.
--    Pattern matches 0019 (CLAIM/RELEASE) and 0018 (invitations).
UPDATE roles
   SET permissions = permissions || jsonb_build_array('CLOSE incidents')
 WHERE name IN ('master', 'admin_org')
   AND NOT (permissions ? 'CLOSE incidents');

-- 4) Propagate to users.permissions for users already holding those roles.
--    Without this, a master or admin_org created BEFORE this migration runs
--    keeps the OLD denormalized permission set and sees 403 on close. Same
--    failure mode that bit us on the `UPDATE incidents` grant; documented
--    in the builder guide ("toda migración que conceda permisos toca
--    roles.permissions Y users.permissions").
UPDATE users u
   SET permissions = permissions || jsonb_build_array('CLOSE incidents')
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'admin_org')
   AND NOT (u.permissions ? 'CLOSE incidents');

-- 5) Bump the permission_version so the next JWT validation invalidates the
--    cached `perm:v3:uid:*` blob. Mirrors the contract used by RolesService
--    when roles are assigned (D2 in 0009). One bump per migration that
--    changes effective permissions, never per-request.
UPDATE users u
   SET permission_version = permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'admin_org');

COMMIT;
