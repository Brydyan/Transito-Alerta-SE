-- 0064 — Seed the "Auditoría de Acceso" menu option (F6 audit-logs)
-- Transito Alerta SE — audit logs sidebar visibility fix
--
-- Problem:
--   The sidebar is entirely data-driven. MenusService.getMenuForUser reads
--   `menu_options` + `menu_option_roles` — NOT MENU_MAP (menus.service.ts:18,
--   "reads menu_options + menu_option_roles instead of MENU_MAP"). F6 shipped
--   the complete audit-logs screen (route + permissionGuard at
--   app.routes.ts:188, component, service, specs), 0053 registered the
--   `READ audit-logs` permission and 0054 registered the GET endpoints — but
--   no migration ever inserted the menu_options ROW.
--
--   `MENU_MAP` still carries an 'Auditoría de Acceso' entry
--   (menu-map.ts:114-126), which is exactly why the item looks like it
--   "should" already be there. That entry is dead for this purpose: since the
--   D5 data-driven cutover the map is only a route -> permission lookup
--   (menus.service.ts:42-44). This is the same hole 0060 fixed for
--   Departamentos ("added to MENU_MAP after the initial migration but never
--   seeded as a menu_option") — the gap is process, not code: every
--   MENU_MAP entry needs a matching menu_options row.
--
--   Verified against the live DB before writing this: 34 rows in menu_options,
--   0 of them with an audit route, while `permissions` did contain
--   audit-logs/READ.
--
-- Fix:
--   1. Insert the menu_option as a child of the GESTIÓN root
--      (a0000000-0000-0000-0000-000000000002) with display_order 85, between
--      Departamentos (81) and Categorías (90). Route, icon and order are taken
--      from MENU_MAP (menu-map.ts:120-126) so the seeded row and the map
--      agree; menu.service.spec.ts:120 already asserts the same contract.
--
--      `id` is left to the DEFAULT gen_random_uuid() and the INSERT is guarded
--      by NOT EXISTS on route, so this file is safe to re-run.
--
--      parent_id is not cosmetic: MenusService.buildTree drops any child whose
--      parent is absent from the accessible set ("orphans excluded", see the
--      0063 header). The GESTIÓN root already grants can_read to master, so the
--      child resolves for the role this migration grants.
--
--   2. Grant can_read to master ONLY.
--
--      Why master only: the resolver's extra permission filter is disabled
--      (menus.service.ts:99-104 — "menu_option_roles already governs access"),
--      so this matrix is the ONLY sidebar gate — while the route guard still
--      requires `READ audit-logs` (app.routes.ts:191). 0059:97 records that
--      permission as admin-only ("solo master, OD-2 de la 0053"). Copying
--      Organizaciones' 4-role matrix instead would render a VISIBLE menu item
--      that permissionGuard then rejects for the extra roles: a phantom entry.
--
-- Operational note: the resolved menu is cached in Redis under
-- `menu:v1:user:{userId}` with a 1-hour TTL (menus.service.ts:112-113). After
-- applying this, flush `menu:v1:*` or the change stays invisible until expiry.
--
-- Rollback: database/rollback/0064_audit_logs_menu.DOWN.sql

BEGIN;

-- 1) Menu option under the GESTIÓN root.
INSERT INTO menu_options
  (name, route, icon, parent_id, display_order, is_active, created_at, updated_at)
SELECT 'Auditoría de Acceso', '/admin/audit-logs', 'file-text',
       'a0000000-0000-0000-0000-000000000002', 85, true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM menu_options
  WHERE route = '/admin/audit-logs' AND deleted_at IS NULL
);

-- 2) Access matrix: master only (see header).
INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT m.id, r.id, true, false
FROM menu_options m, roles r
WHERE m.route = '/admin/audit-logs'
  AND m.deleted_at IS NULL
  AND r.name = 'master'
  AND r.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO UPDATE
  SET can_read = EXCLUDED.can_read,
      can_write = EXCLUDED.can_write;

-- Record this migration (idempotent: re-running after a partial failure must
-- not hit the PK on schema_migrations and roll the whole transaction back).
-- checksum 'manual' matches 0063's convention for hand-applied migrations.
INSERT INTO schema_migrations (version, name, checksum)
VALUES ('0064', '0064_audit_logs_menu.sql', 'manual')
ON CONFLICT (version) DO NOTHING;

COMMIT;
