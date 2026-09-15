-- Migration 0057: Departments Module — permissions
-- Transito Alerta SE — `back/2026-09-15-departments-module`
--
-- Same shape as 0052/0053/0054/0055:
--   1. INSERT catalog rows for `departments` resource (READ/CREATE/UPDATE/DELETE)
--   2. Grant those UUIDs to roles that need department management:
--      `master` and `admin_org` per proposal.md "admin_organizacion and above
--      gain departments perms" (post-0040, `admin_organizacion` was renamed
--      to `admin_org`; the proposal's older role names are translated here).
--      `operador_sistema` is intentionally NOT granted — it's a read-only
--      role per migration 0040 and should not create/edit departments.
--   3. Denormalize to `users.permissions` of active users and bump
--      `permission_version` to invalidate `perm:v3:uid:*` cache (T3.9 §3 [R4]).
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0009 (permissions table + roles.permissions JSONB), 0051
-- (roles.permissions UUID format), 0052 (catalog pattern).
--
-- Rollback: database/rollback/0057_department_permissions.DOWN.sql

BEGIN;

-- 1) Catalog: inserta 4 filas (idempotente).
INSERT INTO permissions (resource, action) VALUES
  ('departments', 'READ'),
  ('departments', 'CREATE'),
  ('departments', 'UPDATE'),
  ('departments', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

-- 2) Grant a roles con scope organizacional — concatena las UUIDs
--    del catálogo y deduplica con `jsonb_agg(DISTINCT elem)`.
--    Mismo patrón que 0052/0053/0054.
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND p.resource = 'departments'
           AND p.action IN ('READ', 'CREATE', 'UPDATE', 'DELETE'))
     ) AS elem
   )
 WHERE r.name IN ('master', 'admin_org')
   AND r.deleted_at IS NULL;

-- 3) Denormalizar a `users.permissions` de los usuarios activos de los
--    roles afectados. Bumpear `permission_version` invalida el cache
--    `perm:v3:uid:*` (T3.9 §3 [R4]).
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'admin_org')
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

COMMIT;
