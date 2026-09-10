-- 0052_missing_permissions_catalog.sql
-- Cierra un segundo gap del catálogo de permisos (T7.2.D1
-- style — el primer gap fue 0049 con users/permissions; este es
-- el de dashboard y assignments). El seed `0009_roles_permissions`
-- sembró las acciones obvias (READ/CRUD sobre incidents/comments,
-- READ/UPDATE sobre users, etc.) pero se olvidó de:
--
--   * `dashboard`: el recurso existe en código (3 endpoints en
--     `incidents.controller.ts` — stats, weekly-stats, feed — y 1
--     en `operators.controller.ts` — operator/dashboard — todos
--     con `@RequirePermission('READ', 'dashboard')`) pero la
--     fila no estaba en `permissions`. Resultado: cualquier
--     `env.provisionUser(['READ dashboard'])` en e2e dropeaba
--     el permiso con un warning, y el master que llamaba
--     `GET /api/incidents/stats` recibía 403 porque el guard no
--     encontraba el UUID para traducir.
--
--   * `assignments`: el seed sembró sólo `READ` y `ASSIGN` para
--     assignments. Faltan `UPDATE` y `DELETE` — que el
--     `assignments.controller.ts` usa (`@Patch(':id')` requiere
--     UPDATE, `@Delete(':id')` requiere DELETE; el `inferResourceFromPath`
--     los traduce desde el path). Resultado: `PATCH /assignments/:id`
--     devolvía 403 al admin_org incluso con `UPDATE assignments`
--     en su rol denormalizado.
--
-- Idempotente: `ON CONFLICT DO NOTHING` por (resource, action)
-- UNIQUE. `GRANT` al rol `master` y denormalización a
-- `users.permissions` de los master activos, con bump de
-- `permission_version` para invalidar `perm:v3:uid:*`.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.

BEGIN;

INSERT INTO permissions (resource, action) VALUES
  ('dashboard', 'READ'),
  ('assignments', 'UPDATE'),
  ('assignments', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

-- Conceder al rol `master`. JSONB concat: agregamos las 3 nuevas
-- entradas (deduplicadas) al array existente.
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND (
             (p.resource = 'dashboard' AND p.action = 'READ') OR
             (p.resource = 'assignments' AND p.action = 'UPDATE') OR
             (p.resource = 'assignments' AND p.action = 'DELETE')
           ))
     ) AS elem
   )
 WHERE r.name = 'master'
   AND r.deleted_at IS NULL;

-- Denormalizar a `users.permissions` de los master activos.
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'master'
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

COMMIT;
