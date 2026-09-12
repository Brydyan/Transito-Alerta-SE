-- 0053_audit_logs_permission.DOWN.sql
-- Reversa del UP 0053. Mismo patrón simétrico que 0049/0050/0052:
--   1. Quita el UUID de `audit-logs / READ` del array del rol
--      `master` (sólo si todavía existe y no está soft-deleted).
--   2. Denormaliza a `users.permissions` de los master activos con
--      bump de `permission_version` para invalidar el cache
--      `perm:v3:uid:*` (T3.9 design §3 [R4]).
--   3. Soft-delete de la fila del catálogo (preserva auditoría;
--      el `PermissionLookupService` filtra por `deleted_at IS NULL`
--      así que deja de ser visible para el guard inmediatamente).
--
-- Idempotente: si una entrada ya no está, el filtro WHERE no
-- matchea. Si la fila de catálogo ya está soft-deleted, el UPDATE
-- no la toca de nuevo.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.

BEGIN;

-- 1) Quitar la UUID del array del rol `master`.
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (
       SELECT id::text FROM permissions
        WHERE deleted_at IS NULL
          AND resource = 'audit-logs'
          AND action = 'READ'
     )
   )
 WHERE r.name = 'master'
   AND r.deleted_at IS NULL;

-- 2) Denormalizar a `users.permissions` de los master activos
--    con bump de `permission_version` para invalidar el cache.
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'master'
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

-- 3) Soft-delete de la fila del catálogo.
UPDATE permissions
   SET deleted_at = now()
 WHERE deleted_at IS NULL
   AND resource = 'audit-logs'
   AND action = 'READ';

COMMIT;
