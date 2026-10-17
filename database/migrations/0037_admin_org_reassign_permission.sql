-- 2026-10-17 — admin_org: agregar "UPDATE assignments"
--
-- Permite reasignar incidencias a otro operador cuando el actual
-- está saturado o no disponible. `PATCH /api/assignments/:id`
-- requiere el permiso `UPDATE assignments`
-- (`assignments.controller.ts @RequirePermission('UPDATE')`); sin
-- este permiso admin_org recibe 403 al intentar reasignar.
--
-- El seed (`0009_roles_permissions.sql`) se corrigió en la misma
-- fecha para que un entorno limpio (CI, onboarding, supabase nuevo)
-- parta con el estado correcto sin depender de esta migración.
-- Acá agregamos el permiso en staging / prod donde el seed ya
-- está aplicado.
--
-- Idempotente: usa `NOT (permissions @> ...)` para no duplicar el
-- elemento en el array JSONB si la migración corre más de una vez
-- (caso staging donde se re-aplica por DROP/RE-apply).
--
-- Rollback: `database/rollback/0037_admin_org_reassign_permission.DOWN.sql`.

BEGIN;

UPDATE roles
SET permissions = permissions || '["UPDATE assignments"]'::jsonb
WHERE name = 'admin_org'
  AND NOT (permissions @> '["UPDATE assignments"]'::jsonb);

COMMIT;