-- 0050_roles_crud_permissions.sql
-- Transito Alerta SE — F6 / `2026-09-08-f6-roles-redesign` + `2026-09-09-roles-stats-endpoint`.
--
-- Cierra el gap pre-existente del catálogo: el controller de
-- roles (`backend/src/modules/roles/roles.controller.ts`) usa
-- `@RequirePermission('CREATE'|'UPDATE'|'DELETE')` en los
-- endpoints POST/PATCH/DELETE, pero el catálogo sembrado por
-- `0009_roles_permissions.sql` y sus migrations subsiguientes
-- sólo creó `READ roles` y `ASSIGN roles`. Resultado: ningún
-- usuario del sistema podía crear, editar o eliminar roles
-- desde la pantalla de Gestión de Roles (mock 04-01) sin
-- recibir 403 `Missing permission: UPDATE roles`.
--
-- Esta migration agrega los 3 perms faltantes al catálogo y los
-- otorga a `master` (los otros roles no deben poder manipular
-- el catálogo de roles — `operador_sistema` y `operador_org`
-- sólo necesitan `READ roles` para el endpoint de detalle).
--
-- Patrón: mismo que `0049_admin_user_permissions.sql`.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.

BEGIN;

-- 1) Catalog: insertar los 3 perms faltantes (idempotente).
INSERT INTO permissions (resource, action) VALUES
  ('roles', 'CREATE'),
  ('roles', 'UPDATE'),
  ('roles', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

-- 2) Grant a master (los otros roles NO — ver header).
UPDATE roles
   SET permissions = permissions || '["CREATE roles", "UPDATE roles", "DELETE roles"]'::jsonb
 WHERE name = 'master'
   AND NOT (permissions ? 'CREATE roles');

-- 3) Denormalizar al user master + bump permission_version para
--    invalidar `perm:v3:uid:*` en Redis (DB 1).
UPDATE users u
   SET permissions = u.permissions || '["CREATE roles", "UPDATE roles", "DELETE roles"]'::jsonb,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'master'
   AND u.deleted_at IS NULL
   AND NOT (u.permissions ? 'CREATE roles');

COMMIT;
