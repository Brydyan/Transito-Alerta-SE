-- 0066_status_history_permission.sql
-- Concede el permiso READ sobre status-history a todos los roles que posean
-- el permiso READ sobre incidents.
--
-- Denormaliza el nuevo array de permisos a los usuarios afectados,
-- incrementando permission_version en +1 para forzar la invalidación
-- de sesión en caché (Redis).

BEGIN;

INSERT INTO permissions (resource, action) VALUES
  ('status-history', 'READ')
ON CONFLICT (resource, action) DO NOTHING;

-- Conceder a los roles que tienen READ incidents.
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND p.resource = 'status-history' 
           AND p.action = 'READ'
       )
     ) AS elem
   )
 WHERE r.deleted_at IS NULL
   AND EXISTS (
       SELECT 1
       FROM jsonb_array_elements_text(r.permissions) AS p_id
       WHERE p_id = (
           SELECT id::text 
           FROM permissions 
           WHERE resource = 'incidents' 
             AND action = 'READ' 
             AND deleted_at IS NULL 
           LIMIT 1
       )
   );

-- Denormalizar a `users.permissions` de los usuarios activos cuyos roles
-- fueron afectados.
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
       FROM jsonb_array_elements_text(r.permissions) AS p_id
       WHERE p_id = (
           SELECT id::text 
           FROM permissions 
           WHERE resource = 'status-history' 
             AND action = 'READ' 
             AND deleted_at IS NULL 
           LIMIT 1
       )
   );

COMMIT;
