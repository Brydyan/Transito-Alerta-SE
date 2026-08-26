-- 0039_organizations_permissions.DOWN.sql
-- Reverses 0039_organizations_permissions.sql (T7.9.B only — see header of
-- the UP file for why Fase C is not part of this migration yet).

BEGIN;

-- 1) Drop the JSONB entries added to roles.permissions.
UPDATE roles
   SET permissions = (
     SELECT jsonb_agg(elem)
       FROM jsonb_array_elements(permissions) AS elem
      WHERE elem NOT IN ('"READ notifications"'::jsonb, '"UPDATE notifications"'::jsonb)
   )
 WHERE name IN ('admin_sistema', 'operador_sistema', 'admin_organizacion', 'operador_organizacion');

-- 2) Drop the new permission catalog rows.
DELETE FROM permissions
 WHERE resource = 'notifications'
   AND action IN ('READ', 'UPDATE');

COMMIT;
