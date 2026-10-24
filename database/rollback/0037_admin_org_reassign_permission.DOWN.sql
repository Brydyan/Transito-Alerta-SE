-- 2026-10-17 — admin_org: revertir "UPDATE assignments"
--
-- Rollback de `0037_admin_org_reassign_permission.sql`. Quita el
-- elemento `"UPDATE assignments"` del array JSONB de permissions.
-- Usa `jsonb_agg` con un `FILTER` implícito para reconstruir el
-- array sin el valor a quitar. Si el array queda vacío después
-- del filter, JSONB devuelve NULL — el coalesce lo cambia a `'[]'`
-- para mantener la columna consistente (NOT NULL con DEFAULT '[]').

BEGIN;

UPDATE roles
SET permissions = COALESCE(
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(permissions) AS elem
    WHERE elem::text <> '"UPDATE assignments"'
  ),
  '[]'::jsonb
)
WHERE name = 'admin_org';

COMMIT;