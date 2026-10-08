-- 0066_status_history_permission.DOWN.sql
-- Reversa del UP 0066. El UP concedió `(status-history, READ)` a todo rol
-- con `incidents:READ` y denormalizó a los usuarios activos de esos roles.
-- El DOWN revierte ambos lados: quita el UUID de `status-history` del array
-- de permisos de esos roles y re-denormaliza a los usuarios activos con
-- bump de `permission_version`.
--
-- MISMA FORMA que `0056_dashboard_permission_staff.DOWN.sql` — las dos
-- migraciones conceden un `:READ` a "todo rol con `incidents:READ`" y sólo
-- cambian el recurso. Si alguna vez divergen, ésa es la referencia.
--
-- Por qué esta migración existe: los endpoints de `status-history` exigen
-- `@RequirePermission('READ','status-history')`, pero el permiso sólo estaba
-- en el catálogo (lo creó `0014_status_history.sql`, líneas 83-85) y en el
-- rol `master`. Los operadores que leen incidencias no podían leer su
-- historial: recibían 403.
--
-- NO toca la fila del catálogo `permissions`: esa fila la creó `0014`, no
-- `0066` — el `INSERT ... ON CONFLICT DO NOTHING` del UP es un no-op sobre
-- cualquier base donde 0014 ya corrió. Borrarla aquí rompería el estado que
-- 0014 dejó, y dejar la fila sin referencias es inofensivo (el catálogo
-- es la fuente de verdad). Mismo criterio que la DOWN de 0056.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.
--
-- Idempotente en el EFECTO, no en las filas afectadas: re-ejecutar vuelve a
-- escribir el MISMO conjunto de permisos (el `NOT IN` del paso 1 vive en la
-- expresión del `SET`, no en el `WHERE`, así que el UPDATE sigue matcheando a
-- todo rol con `incidents:READ`) y re-sincroniza `users.permissions`. El dato
-- no cambia; el `permission_version` de los usuarios sí se bumpea otra vez,
-- lo que vuelve a invalidar `perm:v3:uid:*` sin necesidad. Es el mismo
-- comportamiento que la DOWN de 0056, y se conserva a propósito para que las
-- dos migraciones gemelas se puedan leer en paralelo.
--
-- Límite honesto de este rollback
-- ------------------------------
-- El UP no registró QUIÉN tenía `status-history:READ` antes de aplicarlo: sólo
-- que, después, todo rol con `incidents:READ` lo tenía. Por eso este DOWN
-- revoca el permiso a todo rol con `incidents:READ`, que es el alcance del
-- UP. Si a mano —o por otra migración— se le hubiera concedido a un rol que
-- NO tiene `incidents:READ`, el permiso sobrevive (correcto: el UP tampoco lo
-- habría tocado). Y si un rol con `incidents:READ` lo tenía desde antes del
-- UP, este DOWN se lo quita igual. Ninguna de las dos situaciones es
-- recuperable desde el estado final sin un registro de quién ya lo tenía;
-- queda documentado en vez de fingir precisión que no tenemos.
--
-- Verificar ANTES de ejecutar — debe dar 0 filas:
--
--   SELECT r.name
--     FROM roles r
--    WHERE r.deleted_at IS NULL
--      AND r.permissions @> jsonb_build_array(
--            (SELECT id::text FROM permissions
--              WHERE resource = 'status-history'
--                AND action = 'READ'
--                AND deleted_at IS NULL))
--      AND r.permissions @> jsonb_build_array(
--            (SELECT id::text FROM permissions
--              WHERE resource = 'incidents'
--                AND action = 'READ'
--                AND deleted_at IS NULL));
--
-- Devuelve los roles que STILL tienen `status-history:READ` y `incidents:READ`:
-- exactamente los que este DOWN va a tocar. Si devuelve algo después de
-- ejecutarlo, el rollback no hizo lo que debía.

BEGIN;

-- 1. Quitar el UUID de `status-history:READ` de los roles con `incidents:READ`.
UPDATE roles r
   SET permissions = (
     SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (
       SELECT id::text FROM permissions
        WHERE deleted_at IS NULL
          AND resource = 'status-history'
          AND action = 'READ'
     )
   )
 WHERE r.deleted_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM permissions i
      WHERE i.resource = 'incidents'
        AND i.action = 'READ'
        AND i.deleted_at IS NULL
        AND r.permissions @> jsonb_build_array(i.id::text)
   );

-- 2. Re-denormalizar a `users.permissions` de los usuarios activos de esos
--    roles con bump de `permission_version` (invalida `perm:v3:uid:*`,
--    T3.9 §3 [R4]).
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
       FROM permissions i
      WHERE i.resource = 'incidents'
        AND i.action = 'READ'
        AND i.deleted_at IS NULL
        AND r.permissions @> jsonb_build_array(i.id::text)
   );

COMMIT;
