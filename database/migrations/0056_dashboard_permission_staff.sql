-- 0056_dashboard_permission_staff.sql
-- Cierra el bug "Missing permission: READ dashboard" para roles no-master.
--
-- Contexto: la 0052 cerró el gap del catálogo insertando `(dashboard, READ)`
-- y `(assignments, UPDATE/DELETE)`, pero concedió `dashboard` SOLO a master.
-- El menú dinámico F5.6.8 (0055) le muestra el Dashboard a todo rol con
-- `READ incidents`, y los endpoints del dashboard
-- (`GET /api/incidents/stats`, `GET /api/incidents/weekly-stats`,
-- `GET /api/operator/dashboard`) exigen `@RequirePermission('READ','dashboard')`.
-- Resultado: los roles staff ven la entrada del menú pero reciben 403 al
-- cargar las statísticas — el `PermissionLookupService.getUuid('READ',
-- 'dashboard')` devuelve null cuando la fila no existe (docker), o el UUID
-- no está en `roles.permissions` cuando la fila sí existe (supabase, 0052).
--
-- Esta migración alinea el catálogo con el contrato del menú:
--   1. Inserta `(dashboard, READ)` si falta (idempotente — en supabase ya
--      la creó la 0052).
--   2. Concede `dashboard` a TODO rol que tenga `incidents:READ` (los mismos
--      roles que ven la entrada del Dashboard en el menú dinámico), con
--      `jsonb_agg(DISTINCT)` para no duplicar.
--   3. Denormaliza a `users.permissions` de los usuarios activos de esos
--      roles y bumpea `permission_version` para invalidar `perm:v3:uid:*`.
--
-- Idempotente: `ON CONFLICT` en el INSERT, `DISTINCT` en la agregación,
-- y el WHERE de roles filtra por existencia de `incidents:READ` (no por
-- ausencia de `dashboard`), así que re-ejecutar no agrega nada nuevo.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.

BEGIN;

-- 1. Garantizar la fila de catálogo (no-op en supabase, insert en docker).
INSERT INTO permissions (resource, action) VALUES ('dashboard', 'READ')
ON CONFLICT (resource, action) DO NOTHING;

-- 2. Conceder `dashboard:READ` a todo rol con `incidents:READ`.
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(d.id::text), '[]'::jsonb)
          FROM permissions d
         WHERE d.resource = 'dashboard'
           AND d.action = 'READ'
           AND d.deleted_at IS NULL)
     ) AS elem
   )
 WHERE r.deleted_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM permissions i
      WHERE i.resource = 'incidents'
        AND i.action = 'READ'
        AND i.deleted_at IS NULL
        AND r.permissions @> jsonb_build_array(i.id::text)
   );

-- 3. Denormalizar a `users.permissions` de los usuarios activos y bumpear
--    `permission_version` para invalidar `perm:v3:uid:*` (T3.9 §3 [R4]).
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM permissions i
      WHERE i.resource = 'incidents'
        AND i.action = 'READ'
        AND i.deleted_at IS NULL
        AND r.permissions @> jsonb_build_array(i.id::text)
   );

COMMIT;