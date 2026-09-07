-- 0047_reveal_permission.DOWN.sql
-- Rollback for 0047 — quita REVEAL del CHECK, del permiso, de
-- `roles.permissions` y `users.permissions` de master, y
-- restaura el bump de `permission_version`.
--
-- BORRADO DE DATOS: si la fase AUD ya reveló autorías en
-- producción, esa información NO se pierde con este rollback
-- (queda en `audit_events` y en el historial implícito de
-- la tabla). Lo que se pierde es la capacidad de volver a
-- revelar: el CHECK se reduce y master pierde la concesión.

BEGIN;

-- Quitar REVEAL de `roles.permissions` de master.
UPDATE roles
  SET permissions = permissions - 'REVEAL incidents'
  WHERE name = 'master';

-- Re-denormalizar a users.permissions y bumpear version.
UPDATE users
  SET permissions = (
        SELECT r.permissions
          FROM roles r
         WHERE r.id = users.role_id
       ),
      permission_version = permission_version + 1
  WHERE role_id = (SELECT id FROM roles WHERE name = 'master')
    AND deleted_at IS NULL;

-- Borrar la fila de permiso.
DELETE FROM permissions WHERE resource = 'incidents' AND action = 'REVEAL';

-- Restaurar el CHECK sin REVEAL. Como 0011 lo creó con
-- ('READ','CREATE','UPDATE','DELETE','ASSIGN'), 0019 con
-- CLAIM/RELEASE, 0043 con CLOSE, restauramos al estado
-- post-0043: las mismas 8 acciones que 0043.
ALTER TABLE permissions DROP CONSTRAINT IF EXISTS permissions_action_check;
ALTER TABLE permissions ADD CONSTRAINT permissions_action_check
  CHECK (action IN (
    'READ', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN',
    'CLAIM', 'RELEASE',
    'CLOSE'
  ));

COMMIT;
