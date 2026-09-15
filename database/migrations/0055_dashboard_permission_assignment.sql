-- Migration 0055: Dashboard Permission Assignment
-- Transito Alerta SE — Fix missing dashboard permission on master/operator roles
--
-- Context: T5.2 (Incident Analytics) endpoints `GET /incidents/stats`,
-- `GET /incidents/weekly-stats` require `READ dashboard` permission guard.
-- Permission catalog exists (0052) but roles weren't assigned it. This migration
-- adds the permission UUID to master + operator roles.permissions JSONB array,
-- then denormalizes to users.permissions + bumps permission_version to invalidate
-- Redis cache perm:v3:uid:*.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0009 (permissions table), 0051 (UUID format), 0052 (dashboard catalog).
--
-- Rollback: database/rollback/0055_dashboard_permission_assignment.DOWN.sql

BEGIN;

-- 1) Get dashboard READ permission UUID once
CREATE TEMPORARY TABLE dashboard_perm AS
  SELECT id FROM permissions
  WHERE resource = 'dashboard' AND action = 'READ';

-- 2) Update master role: add dashboard READ if not already present
UPDATE roles
SET permissions = permissions || (SELECT jsonb_build_array(id::text) FROM dashboard_perm)
WHERE name = 'master'
  AND NOT permissions @> (SELECT jsonb_build_array(id::text) FROM dashboard_perm);

-- 3) Update operator role: add dashboard READ if not already present
UPDATE roles
SET permissions = permissions || (SELECT jsonb_build_array(id::text) FROM dashboard_perm)
WHERE name = 'operator'
  AND NOT permissions @> (SELECT jsonb_build_array(id::text) FROM dashboard_perm);

-- 4) Denormalize: sync users.permissions + bump permission_version for both roles
UPDATE users u
SET permissions = r.permissions,
    permission_version = permission_version + 1,
    updated_at = now()
FROM roles r
WHERE u.role_id = r.id
  AND r.name IN ('master', 'operator')
  AND u.deleted_at IS NULL;

COMMIT;
