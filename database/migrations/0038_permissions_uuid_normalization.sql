-- 0038_permissions_uuid_normalization.sql
-- 2026-10-20 — normalización definitiva de `roles.permissions` / `users.permissions`
--
-- CONTEXTO (por qué esta migración existe)
-- ─────────────────────────────────────────────────────────────────────────
-- Desde 0026 el formato canónico de `roles.permissions` es un array JSONB de
-- UUIDs del catálogo `permissions`. 0026 remapeaba los strings al UUID usando
--
--     p.action   = split_part(elem, ' ', 1)
--     p.resource = split_part(elem, ' ', 2)
--
-- es decir, parseando por ESPACIO. Eso normaliza correctamente el formato
-- canónico `"ACTION resource"` (0016/0018/0019/0021 §1), pero NO reconoce el
-- formato `resource:ACTION` que 0021 §6 inyectó:
--
--     0021_t6_t7_schema_completeness.sql:167,169,179,181
--       SELECT '"incident-images:CREATE"'::jsonb
--       SELECT '"incident-images:DELETE"'::jsonb
--
-- Para esos elementos `split_part(elem,' ',1)` devuelve el string entero y
-- `split_part(elem,' ',2)` devuelve `''`, así que el LEFT JOIN no matchea y el
-- `COALESCE(p.uuid, elem)` de 0026:38 los deja intactos — por diseño, según su
-- propio header ("si no matchea ningún action+resource del catálogo, se queda
-- como está"). 0026 CONFUNDIÓ ese formato con un UUID válido.
--
-- Consecuencia en runtime: esos strings se propagaron a `users.permissions` por
-- cuatro vectores (0026:59-66, 0027:52-77, 0028:110-173, y el más permanente,
-- `RolesService.assignRole` → `user.permissions = role.permissions` en
-- backend/src/modules/roles/roles.service.ts:154). Luego
-- `PermissionLookupService.getDescriptionsByUuids` los pasa sin sanear a un
-- `IN (...)` sobre una columna uuid (permission-lookup.service.ts:108) y
-- Postgres responde:
--
--     ERROR: 22P02  invalid input syntax for type uuid: "incident-images:CREATE"
--
-- → `GET /api/auth/me` devuelve 500 con
--   {"statusCode":500,"message":"Internal server error"}  (52 bytes exactos)
--
-- El 0037 volvió a introducir el mismo patrón de bug (`"UPDATE assignments"`
-- como string literal) DESPUÉS de 0026; esta migración también lo sanea.
--
-- ALCANCE DE ESTA MIGRACIÓN
-- ─────────────────────────
-- Recorre `roles.permissions` elemento por elemento y:
--   1. `"ACTION resource"` → UUID del catálogo   (idempotente con 0026)
--   2. `resource:ACTION`   → UUID del catálogo   (el caso que 0026 no vio)
--   3. ya es UUID           → se deja             (idempotente)
--   4. irreconocible        → se DESCARTA         (see NOTICE abajo)
-- Luego denormaliza a `users.permissions` con el mismo patrón que
-- 0026/0027/0028.
--
-- ⚠️ SOBRE EL CASO 4 (elementos que se descartan)
-- Un elemento que no matchea el catálogo en ninguno de los tres formatos
-- anteriores no tiene traducción posible. Antes de aplicar, revisar el alcance:
--
--   SELECT r.name, e AS elemento
--     FROM roles r, jsonb_array_elements_text(r.permissions) e
--    WHERE r.deleted_at IS NULL
--      AND e !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--      AND e !~* '^\S+ \S+$'
--      AND e !~* '^\S+:\S+$';
--
-- Esta migración emite un NOTICE con el conteo por rol de lo que descartó,
-- para que la pérdida sea visible en los logs en vez de silenciosa.
--
-- Idempotente: se puede correr N veces sin efecto acumulativo. La segunda
-- corrida no cambia nada (`permissions IS DISTINCT FROM`).
--
-- Rollback: database/rollback/0038_permissions_uuid_normalization.DOWN.sql

BEGIN;

DO $$
DECLARE
  v_discarded text;
BEGIN
  -- ─────────────────────────────────────────────────────────────────────
  -- 1) Normalizar roles.permissions
  -- ─────────────────────────────────────────────────────────────────────
  CREATE TEMP TABLE _perm_remap ON COMMIT DROP AS
  WITH perm_lookup AS (
    SELECT resource, action, id::text AS uuid
      FROM permissions
     WHERE deleted_at IS NULL
  ),
  normalized AS (
    SELECT r.id AS role_id, e.elem,
           COALESCE(
             -- formato canónico "ACTION resource"
             (SELECT p.uuid FROM perm_lookup p
               WHERE p.action   = split_part(e.elem, ' ', 1)
                 AND p.resource = split_part(e.elem, ' ', 2)),
             -- formato erróneo "resource:ACTION" (0021 §6)
             (SELECT p.uuid FROM perm_lookup p
               WHERE p.resource = split_part(e.elem, ':', 1)
                 AND p.action   = split_part(e.elem, ':', 2)),
             -- ya es UUID
             CASE WHEN e.elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  THEN e.elem END
           ) AS uuid
      FROM roles r
      CROSS JOIN LATERAL jsonb_array_elements_text(r.permissions) AS e(elem)
     WHERE r.deleted_at IS NULL
  )
  SELECT role_id,
         COALESCE(jsonb_agg(uuid) FILTER (WHERE uuid IS NOT NULL), '[]'::jsonb) AS perms,
         jsonb_agg(elem) FILTER (WHERE uuid IS NULL) AS discarded
    FROM normalized
   GROUP BY role_id;

  -- Superficie lo que se va a perder. Sin esto, `FILTER (WHERE uuid IS NOT NULL)`
  -- borra en silencio y nadie se entera hasta que un endpoint 403ea.
  SELECT string_agg(
           format('%s: %s', role_id, discarded::text), E'\n  ' ORDER BY role_id)
    INTO v_discarded
    FROM _perm_remap
   WHERE discarded IS NOT NULL;

  IF v_discarded IS NOT NULL THEN
    RAISE NOTICE E'[0038] Elementos DESCARTADOS (sin traducción posible):\n  %', v_discarded;
    RAISE WARNING '[0038] % elementos descartados. Ver el NOTICE anterior.', (
      SELECT count(*) FROM _perm_remap, jsonb_array_elements(discarded)
    );
  END IF;

  UPDATE roles r
     SET permissions = remap.perms
    FROM _perm_remap remap
   WHERE r.id = remap.role_id
     AND r.permissions IS DISTINCT FROM remap.perms;

  RAISE NOTICE '[0038] roles normalizados: % filas.',
    (SELECT count(*) FROM _perm_remap WHERE discarded IS NOT NULL OR perms IS NOT NULL);

END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Denormalizar a users.permissions (mismo patrón que 0026/0027/0028)
-- ─────────────────────────────────────────────────────────────────────────
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