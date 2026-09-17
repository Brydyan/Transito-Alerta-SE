-- 0061 — Inherit CRUD sub-sub-menu permissions from their parent menu
--
-- Migration 0060 added 12 CRUD entries (Crear/Editar X) under each
-- sub-menu (Usuarios, Roles, Organizaciones, Departamentos, Ubicaciones,
-- Categorías) with no menu_option_roles rows. As a result the role
-- matrix for those entries returns can_read=false / can_write=false
-- for every role, which surfaced as inconsistent UX vs their parent
-- menus (e.g., "Crear usuario" shows all-unchecked while "Usuarios"
-- shows master + operador_sistema with can_read=true).
--
-- This migration copies every parent's menu_option_roles rows down to
-- each CRUD child so the matrix renders the same permissions the admin
-- sees on the parent. No new permissions are granted — these are the
-- exact same role_id + can_read + can_write tuples the parent has, just
-- keyed by the child menu_option_id.
--
-- Idempotent: skips rows that already exist (composite PK on
-- menu_option_id + role_id), so re-running this migration is safe.
--
-- Backend cache invalidation: this migration writes through psql
-- directly, bypassing the API. The MenusService.invalidateCache()
-- is not called. The cache must be flushed manually (e.g., `DEL
-- menu:v1:user:*` in Redis) for the sidebar to reflect the new
-- permissions.

BEGIN;

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
WHERE p.menu_option_id IN (
    -- parent sub-menus (the six that have CRUD children)
    'b0000000-0000-0000-0000-000000000006',  -- Usuarios
    'b0000000-0000-0000-0000-000000000007',  -- Roles
    'b0000000-0000-0000-0000-000000000008',  -- Organizaciones
    'b0000000-0000-0000-0000-000000000012',  -- Departamentos
    'b0000000-0000-0000-0000-000000000010',  -- Ubicaciones
    'b0000000-0000-0000-0000-000000000009'   -- Categorías
)
AND cr.name IN (
    'Crear usuario',         'Editar usuario',
    'Crear rol',             'Editar rol',
    'Crear organización',    'Editar organización',
    'Crear departamento',     'Editar departamento',
    'Crear ubicación',       'Editar ubicación',
    'Crear categoría',       'Editar categoría'
)
ON CONFLICT (menu_option_id, role_id) DO NOTHING;

-- Record this migration
INSERT INTO schema_migrations (version, name, checksum) VALUES ('0061', '0061_inherit_crud_submenu_perms.sql', 'manual');

COMMIT;
