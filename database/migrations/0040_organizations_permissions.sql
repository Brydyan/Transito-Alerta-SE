-- 0039_organizations_permissions.sql
-- Transito Alerta SE — T7.9.B: notifications permission catalog + grants.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires 0009
-- (permissions catalog, roles.permissions) and 0015 (the 4 staff roles)
-- applied first.
--
-- NOTE — this migration is intentionally partial in this batch. Its final
-- name (`organizations_permissions`) anticipates D7.9 Fase C (geography +
-- organizations seed data), which is BLOCKED on an operator input (the real
-- Santa Elena organization list — design.md D12) and is NOT included here.
-- Only Fase B (notifications permissions) is applied by this file today;
-- Fase C's DDL/seed will be appended to this same file once the input
-- arrives, before it is ever run against Supabase (CC3: nothing in this
-- repo has been applied to a shared environment yet for 0038+).
--
-- Fixes gap G23 (design.md §1.4): legacy's `PermissionSeeder` has
-- `notifications:view` / `notifications:update`; ours had neither row in
-- the catalog, and — more importantly — no role's `permissions` JSONB ever
-- granted 'UPDATE notifications', which is the exact string
-- `NotificationsController.approve`/`.reject` (T5.6) has required via
-- `@RequirePermission('UPDATE')` since it was written. Every staff role has
-- therefore always received 403 on those two routes. This migration is the
-- missing grant, not new authorization code (see design.md D14 for the full
-- decision, including why the self-scoped notification routes stay on
-- `JwtAuthGuard` alone).
--
-- Rollback: database/rollback/0039_organizations_permissions.DOWN.sql

BEGIN;

-- T7.9.B2 — catalog rows. 'READ notifications' has no `@RequirePermission`
-- call site today (own-notification routes are scoped by req.user.userId,
-- not by role) — it exists for catalog parity with legacy and for future
-- admin-facing notification listings (design.md D14).
INSERT INTO permissions (resource, action) VALUES
  ('notifications', 'READ'),
  ('notifications', 'UPDATE')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant both to all 4 staff roles (same `||` + `?&` idempotency pattern as
-- 0019_incident_claim.sql). 'reporter' is deliberately excluded — a citizen
-- reporter only ever sees their own notifications through the self-scoped
-- routes, which do not check this permission.
UPDATE roles
   SET permissions = permissions || jsonb_build_array('READ notifications', 'UPDATE notifications')
 WHERE name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
   AND NOT (permissions ?& array['READ notifications', 'UPDATE notifications']);

COMMIT;
