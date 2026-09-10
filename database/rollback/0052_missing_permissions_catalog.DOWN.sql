-- 0052_missing_permissions_catalog.DOWN.sql
-- Reversa del UP 0052. El UP cerró el gap del catálogo agregando
-- `(dashboard, READ)`, `(assignments, UPDATE)` y `(assignments,
-- DELETE)` — concesiones al rol `master` y denormalización a
-- `users.permissions` de los master activos. El DOWN revierte
-- ambos lados: quita esas 3 entradas del array de master (si
-- estuvieran) y soft-deletea las filas de catálogo (preserva
-- la fila para auditoría, no borra).
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.
--
-- Idempotente: si una entrada ya no está, el filtro WHERE
-- simplemente no matchea y no hace nada. Si las filas de
-- catálogo ya están soft-deleted, el UPDATE no las toca de
-- nuevo.

BEGIN;

-- 1. Quitar las 3 UUIDs del array de master (solo si master
--    todavía existe y no está soft-deleted).
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (
       SELECT id::text FROM permissions
        WHERE deleted_at IS NULL
          AND (
            (resource = 'dashboard' AND action = 'READ') OR
            (resource = 'assignments' AND action = 'UPDATE') OR
            (resource = 'assignments' AND action = 'DELETE')
          )
     )
   )
 WHERE r.name = 'master'
   AND r.deleted_at IS NULL;

-- 2. Denormalizar a `users.permissions` de los master activos
--    con bump de `permission_version` para invalidar la cache.
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'master'
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

-- 3. Soft-delete de las filas de catálogo (preserva auditoría;
--    el `PermissionLookupService` filtra por `deletedAt IS NULL`
--    así que dejan de ser visibles para el guard inmediatamente).
UPDATE permissions
   SET deleted_at = now()
 WHERE deleted_at IS NULL
   AND (
     (resource = 'dashboard' AND action = 'READ') OR
     (resource = 'assignments' AND action = 'UPDATE') OR
     (resource = 'assignments' AND action = 'DELETE')
   );

COMMIT;
