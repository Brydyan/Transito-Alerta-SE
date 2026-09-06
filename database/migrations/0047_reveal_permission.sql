-- 0047_reveal_permission.sql
-- Transito Alerta SE — AUD (sc-327): extender el CHECK de
-- permissions.action con REVEAL y concederlo a master.
--
-- Va PRIMERO la extensión del CHECK (C.1), luego el INSERT del
-- permiso, luego la concesión a master — el orden importa:
-- el INSERT falla con CHECK violation si la columna no
-- admite el valor. Misma trampa que dejó CLOSE fuera del
-- catálogo en 0043.
--
-- D5 del design: REVEAL incidents se concede únicamente a
-- master. La extensión a admin_org queda pendiente de la
-- decisión comercial (no se descarta, se difiere).
--
-- C.3: invalidar el caché de permisos. Lo hacemos con una
-- UPDATE que sube `permission_version` para todos los usuarios
-- con rol master, lo que rompe `perm:v3:uid:*` vía la
-- rama `permissionVersion` que `getAuthContextByUserId`
-- evalúa. (T6.8.B3 + el patrón de 0019.)
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0011 (permissions catalog table con CHECK sobre action),
-- 0019 (la columna permissions.action ya admite CLAIM/RELEASE;
-- el CHECK se reemplaza por una lista mayor aquí), 0043 (patrón
-- previo de extender el CHECK para una acción nueva).
--
-- Rollback: database/rollback/0047_reveal_permission.DOWN.sql

BEGIN;

-- C.1: extender el CHECK de permissions.action. El catálogo
-- en 0011 declaraba:
--   CHECK (action IN ('READ', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN'))
-- 0019 lo extendió a:
--   CHECK (action IN (..., 'CLAIM', 'RELEASE'))
-- 0043 lo extendió a:
--   CHECK (action IN (..., 'CLOSE'))
-- Acá añadimos REVEAL. Postgres reemplaza el constraint por su
-- nombre (`permissions_action_check` es el nombre por defecto;
-- lo dropeamos y re-creamos para mantener el shape portable).
ALTER TABLE permissions DROP CONSTRAINT IF EXISTS permissions_action_check;
ALTER TABLE permissions ADD CONSTRAINT permissions_action_check
  CHECK (action IN (
    'READ', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN',
    'CLAIM', 'RELEASE',
    'CLOSE',
    'REVEAL'
  ));

-- C.2: insertar la fila de permiso. La tabla `permissions`
-- tiene columnas `(resource, action)` y la PK es el par
-- (0019). ON CONFLICT (resource, action) DO NOTHING — si la
-- fila ya existe (re-correr la migración), el INSERT no falla.
INSERT INTO permissions (resource, action)
VALUES ('incidents', 'REVEAL')
ON CONFLICT (resource, action) DO NOTHING;

-- Conceder REVEAL incidents al rol `master`. Esta es la
-- concesión canónica (`roles.permissions`); la denormalización
-- a `users.permissions` corre en el `UPDATE` siguiente.
UPDATE roles
  SET permissions = permissions || '["REVEAL incidents"]'::jsonb
  WHERE name = 'master'
    AND NOT (permissions ? 'REVEAL incidents');

-- Denormalizar a users.permissions de los master activos. La
-- invariante del proyecto es: `users.permissions` debe ser copia
-- de `roles.permissions` (T3.2 design D2, T3.9 §3 [R4]).
-- Bumpear `permission_version` invalida el caché de
-- `perm:v3:uid:*` para que la próxima lectura vía
-- `getAuthContextByUserId` reconstruya el blob desde la BD.
UPDATE users
  SET permissions = (
        SELECT r.permissions
          FROM roles r
         WHERE r.id = users.role_id
       ),
      permission_version = permission_version + 1
  WHERE role_id = (SELECT id FROM roles WHERE name = 'master')
    AND deleted_at IS NULL;

COMMIT;
