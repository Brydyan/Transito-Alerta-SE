-- 0049_citizen_social_features.DOWN.sql
-- Rollback for 0049 — quita las tablas de social features, los permisos del
-- catálogo, la concesión en `roles.permissions`, re-denormaliza
-- `users.permissions` y bumpea `permission_version` para invalidar
-- `perm:v3:uid:*` (C.3).
--
-- BORRADO DE DATOS: este rollback ELIMINA incident_followers e
-- incident_corroborations (seguimientos y corroboraciones). Si ya hay
-- actividad social en producción, esos datos se pierden. Es el
-- comportamiento esperado: 0049 es aditivo y el DOWN es la imagen espejo.

BEGIN;

-- 1. Drop tables (indexes se dropean con la tabla).
DROP TABLE IF EXISTS incident_corroborations;
DROP TABLE IF EXISTS incident_followers;

-- 2. Quitar los permisos nuevos de roles.permissions (jsonb).
UPDATE roles
SET permissions = permissions - 'CREATE incident-followers'
                - 'DELETE incident-followers'
                - 'CREATE incident-corroborations'
WHERE name IN ('master', 'operador_sistema', 'admin_org', 'operador_org');

-- 3. Re-denormalizar a users.permissions y bumpear version (imagen espejo
--    del UPDATE de 0049: los usuarios vuelven a la copia del rol ya sin
--    los permisos sociales).
UPDATE users
SET permissions = (
    SELECT permissions FROM roles WHERE roles.id = users.role_id
),
    permission_version = permission_version + 1
WHERE role_id IN (SELECT id FROM roles WHERE name IN ('master', 'operador_sistema', 'admin_org', 'operador_org'));

-- 4. Borrar permisos del catálogo.
DELETE FROM permissions
WHERE resource IN ('incident-followers', 'incident-corroborations')
  AND action IN ('CREATE', 'DELETE');

COMMIT;