-- 0038_permissions_uuid_normalization.DOWN.sql
-- Rollback de `0038_permissions_uuid_normalization.sql`.
--
-- Invierte la normalización: traduce cada UUID de `roles.permissions` de vuelta
-- a su string canónico `"ACTION resource"` — el mismo shape que produce el
-- DOWN de 0026 (`0026_roles_permissions_uuid_format.DOWN.sql`), que es el estado
-- que el proyecto tenía antes de 0026.
--
-- ASIMETRÍA DELIBERADA
-- ────────────────────
-- Este rollback NO resucita los elementos en formato `resource:ACTION`
-- (`"incident-images:CREATE"`, `"incident-images:DELETE"`). Ese formato nunca
-- fue válido — nunca matcheó ningún `@RequirePermission`, y su presencia en
-- `users.permissions` es precisamente lo que provocaba el 500 de
-- `GET /api/auth/me` (22P02, `invalid input syntax for type uuid`).
--
-- Restaurarlos sería un rollback que devuelve el sistema a un estado roto.
-- El estado pre-0038 contenía dos formatos; este rollback devuelve el formato
-- canónico y deja fuera el basura. Para recuperar el array exacto previo
-- harían falta los deltas por rol, que no se registran.
--
-- Idempotente.

BEGIN;

DO $$
DECLARE
  v_unresolved text;
BEGIN
  CREATE TEMP TABLE _perm_unmap ON COMMIT DROP AS
  WITH perm_lookup AS (
    SELECT id::text AS uuid, action, resource
      FROM permissions
     WHERE deleted_at IS NULL
  )
  SELECT r.id AS role_id,
         COALESCE(
           jsonb_agg(
             COALESCE(
               p.action || ' ' || p.resource,   -- UUID → "ACTION resource"
               e.elem                            -- no está en el catálogo: se deja
             )
           ) FILTER (WHERE COALESCE(p.action || ' ' || p.resource, e.elem) IS NOT NULL),
           '[]'::jsonb
         ) AS perms,
         jsonb_agg(e.elem) FILTER (WHERE p.uuid IS NULL) AS unresolved
    FROM roles r
    CROSS JOIN LATERAL jsonb_array_elements_text(r.permissions) AS e(elem)
    LEFT JOIN perm_lookup p ON p.uuid = e.elem
   WHERE r.deleted_at IS NULL
   GROUP BY r.id;

  SELECT string_agg(format('%s: %s', role_id, unresolved::text), E'\n  ' ORDER BY role_id)
    INTO v_unresolved
    FROM _perm_unmap
   WHERE unresolved IS NOT NULL;

  IF v_unresolved IS NOT NULL THEN
    RAISE WARNING E'[0038 DOWN] UUIDs sin fila en el catálogo (se conservan tal cual):\n  %', v_unresolved;
  END IF;

  UPDATE roles r
     SET permissions = unmap.perms
    FROM _perm_unmap unmap
   WHERE r.id = unmap.role_id
     AND r.permissions IS DISTINCT FROM unmap.perms;

END $$;

-- Denormalizar a users.permissions (mismo patrón que 0026/0027/0028).
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL
   AND u.permissions IS DISTINCT FROM r.permissions;

COMMIT;