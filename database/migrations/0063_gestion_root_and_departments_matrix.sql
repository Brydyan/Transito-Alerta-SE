-- 0063 — Fix GESTIÓN root + Departamentos menu access matrix
-- Transito Alerta SE — departments menu visibility fix
--
-- Problem:
--   0055 seeded the GESTIÓN root group with only master + operador_sistema.
--   Later, Organizaciones (0055) and Departamentos (0060) were added as
--   children with broader role matrices (admin_org / operador_org CAN read),
--   but nobody updated the GROUP root. MenusService.buildTree drops any
--   child whose parent is not in the accessible set ("orphans excluded").
--
--   Net effect: for admin_org, the ENTIRE GESTIÓN section disappears from
--   the sidebar (Organizaciones AND Departamentos), even though those
--   children have can_read=true rows for the role. The route itself works
--   when typed manually because it is gated by the `departments`
--   permission catalog (0057), not by the menu matrix.
--
-- Fix (defaults requested by product):
--   1. GESTIÓN root: grant READ to admin_org and operador_org so the
--      section renders for every role that has authorized children under
--      it. can_write stays false — a group header has no action.
--   2. Departamentos parent: master READ+WRITE, operador_sistema
--      READ+WRITE, admin_org READ-only.
--   3. CRUD children (Crear/Editar departamento): inherit the parent
--      matrix (same pattern as 0061).
--
-- Idempotent: ON CONFLICT (menu_option_id, role_id) DO UPDATE resets the
-- flags to these defaults on re-run.
--
-- Backend cache invalidation: this migration writes through psql
-- directly, bypassing the API. The MenusService.invalidateCache() is
-- not called. Flush the per-user menu cache manually (e.g., `DEL
-- menu:v1:user:*` in Redis) for the sidebar to reflect the change.

BEGIN;

-- 1) GESTIÓN root (a0000000-...-002): admin_org + operador_org READ
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'a0000000-0000-0000-0000-000000000002', r.id, true, false
FROM roles r
WHERE r.name IN ('admin_org', 'operador_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO UPDATE
  SET can_read = EXCLUDED.can_read,
      can_write = EXCLUDED.can_write;

-- 2) Departamentos parent (b0000000-...-012): master + operador_sistema
--    READ+WRITE, admin_org READ-only
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT 'b0000000-0000-0000-0000-000000000012', r.id,
       true,
       CASE WHEN r.name = 'admin_org' THEN false ELSE true END
FROM roles r
WHERE r.name IN ('master', 'operador_sistema', 'admin_org')
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO UPDATE
  SET can_read = EXCLUDED.can_read,
      can_write = EXCLUDED.can_write;

-- 3) Crear/Editar departamento: inherit parent matrix (0061 pattern)
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT
  cr.id        AS menu_option_id,
  p.role_id    AS role_id,
  p.can_read,
  p.can_write
FROM menu_option_roles p
JOIN menu_options parent ON parent.id = p.menu_option_id
JOIN menu_options cr
  ON cr.parent_id = parent.id
 AND cr.deleted_at IS NULL
WHERE p.menu_option_id = 'b0000000-0000-0000-0000-000000000012'
  AND cr.name IN ('Crear departamento', 'Editar departamento')
ON CONFLICT (menu_option_id, role_id) DO UPDATE
  SET can_read = EXCLUDED.can_read,
      can_write = EXCLUDED.can_write;

-- Record this migration (idempotent: re-running after a partial failure
-- must not hit the composite PK on schema_migrations and roll the whole
-- transaction back)
INSERT INTO schema_migrations (version, name, checksum)
VALUES ('0063', '0063_gestion_root_and_departments_matrix.sql', 'manual')
ON CONFLICT (version) DO NOTHING;

COMMIT;