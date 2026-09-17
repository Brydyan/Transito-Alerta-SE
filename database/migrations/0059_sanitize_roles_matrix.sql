-- 0059_sanitize_roles_matrix.sql
-- Transito Alerta SE — Saneamiento de la matriz de roles.
--
-- Estado detectado en la DB local (2026-09-16):
--   1. La 0040 (rename roles) nunca se aplicó: coexisten 3 roles legacy
--      (admin_sistema, admin_organizacion, operador_organizacion) con los
--      canónicos (master, admin_org, operador_org, operador_sistema, reporter).
--      Los legacy no tienen usuarios activos; se marcan deleted_at (soft),
--      que es lo que el resto del sistema ya respeta (idem 0050 DOWN).
--   2. La 0049 (users CREATE/DELETE, permissions READ) y la 0053
--      (audit-logs READ) no están aplicadas: faltan en el catálogo y en
--      los roles canónicos.
--   3. La 0029 insertó strings crudos "incident-images:CREATE" /
--      "incident-images:DELETE" en roles.permissions de los roles de
--      organización; la 0051 (UUID format) no los migró en esos 4 roles.
--      Se reemplazan por los UUIDs del catálogo (idéntico formato al que
--      deja la 0051 en master/operador_sistema/reporter).
--
-- Efecto final: 5 roles canónicos activos, catálogo completo
-- (users CRUD añadido por 0049, audit-logs READ añadido por 0053),
-- cero strings crudos en roles.permissions, y denormalización a
-- users.permissions con bump de permission_version.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.
-- Requires 0009 (permissions + roles.permissions JSONB), 0015 (roles
-- staff), 0051 (roles.permissions UUID format), 0052 (catalog pattern).
--
-- Rollback: database/rollback/0059_sanitize_roles_matrix.DOWN.sql.

BEGIN;

-- =====================================================================
-- 1) Catálogo: filas faltantes de 0049 y 0053.
-- =====================================================================
INSERT INTO permissions (resource, action) VALUES
  ('users', 'CREATE'),
  ('users', 'DELETE'),
  ('permissions', 'READ'),
  ('audit-logs', 'READ')
ON CONFLICT (resource, action) DO NOTHING;

-- =====================================================================
-- 2) Limpieza de strings crudos en roles.permissions.
--    Cualquier elemento no-UUID con formato "resource:action" se
--    reemplaza por el UUID del catálogo; si no existe en el catálogo,
--    se elimina. Los elementos que ya son UUID se conservan tal cual.
-- =====================================================================
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
     FROM (
       -- 2a) elementos que ya son UUID (formato canónico post-0051)
       SELECT elem
         FROM jsonb_array_elements_text(r.permissions) elem
        WHERE elem ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       UNION ALL
       -- 2b) strings crudos "resource:action" -> UUID del catálogo
       SELECT p.id::text
         FROM jsonb_array_elements_text(r.permissions) elem
         JOIN permissions p
           ON p.deleted_at IS NULL
          AND p.resource || ':' || p.action = elem
        WHERE NOT (elem ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     ) t
   )
 WHERE r.deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements_text(r.permissions) elem
      WHERE NOT (elem ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
   );

-- =====================================================================
-- 3) Grants de 0049 + 0053 a los roles canónicos (formato UUID, patrón
--    0052 — jsonb_agg DISTINCT sobre los id::text del catálogo).
-- =====================================================================

-- 3a) master: users CREATE/DELETE, permissions READ (0049) + audit-logs
--     READ (0053). Permisos de administración completa del sistema.
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND (
             (p.resource = 'users' AND p.action IN ('CREATE', 'DELETE')) OR
             (p.resource = 'permissions' AND p.action = 'READ') OR
             (p.resource = 'audit-logs' AND p.action = 'READ')
           ))
     ) AS elem
   )
 WHERE r.name = 'master' AND r.deleted_at IS NULL;

-- 3b) admin_org: users CREATE/DELETE + permissions READ (0049).
--     audit-logs READ es admin-only (solo master, OD-2 de la 0053).
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND (
             (p.resource = 'users' AND p.action IN ('CREATE', 'DELETE')) OR
             (p.resource = 'permissions' AND p.action = 'READ')
           ))
     ) AS elem
   )
 WHERE r.name = 'admin_org' AND r.deleted_at IS NULL;

-- =====================================================================
-- 4) Soft-delete de los roles legacy (equivalente al rename 0040, sin
--    colisión de UNIQUE(name) con los canónicos ya existentes).
--    Verificado: 0 usuarios activos en estos roles.
-- =====================================================================
UPDATE roles
   SET deleted_at = now()
 WHERE name IN ('admin_sistema', 'admin_organizacion', 'operador_organizacion')
   AND deleted_at IS NULL;

-- =====================================================================
-- 5) Denormalización a users.permissions + bump (invalida perm:v3:uid:*).
--    Se regenera desde el rol canónico para todos los roles activos
--    (patrón 0052/0053/0054).
-- =====================================================================
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.deleted_at IS NULL
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE;

COMMIT;