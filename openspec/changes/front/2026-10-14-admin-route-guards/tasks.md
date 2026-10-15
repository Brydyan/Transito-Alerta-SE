# Tasks: Admin Route Guard Gap

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~60–90 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migration 0070 + route guards | PR 1 (single) | Manual: reporter URL → redirect; master URL → allowed | Apply 0070 on test DB; deploy frontend locally | `git revert` app.routes.ts; run 0070.DOWN.sql |

---

## Phase 1: Database Migration

- [x] 1.1 Create `database/migrations/0070_system_config_permission.sql` — `INSERT INTO permissions (resource, action) VALUES ('system-config', 'READ') ON CONFLICT DO NOTHING`; `UPDATE roles SET permissions = (jsonb_agg(DISTINCT elem)...)` for `master` and `operador_sistema`; `UPDATE users SET permissions = r.permissions, permission_version = permission_version + 1` for active users of those roles
- [x] 1.2 Create `database/rollback/0070_system_config_permission.DOWN.sql` — remove `READ system-config` UUID from role permission arrays, bump `permission_version`, soft-delete catalog row with `deleted_at = NOW()`
- [ ] 1.3 Verify migration applies cleanly on test DB (`psql` UP run) and rolls back cleanly (`psql` DOWN run)

## Phase 2: Route Guard Configuration

- [x] 2.1 In `frontend/src/app/app.routes.ts`, add `canActivate: [permissionGuard]` and `data: { permission: 'READ users' }` to the `admin/users` list route (`path: ''` child under `admin/users`)
- [x] 2.2 In `frontend/src/app/app.routes.ts`, add `canActivate: [permissionGuard]` and `data: { permission: 'READ roles' }` to the `admin/roles` list route
- [x] 2.3 In `frontend/src/app/app.routes.ts`, fix the broken `admin/config` route — add `permission: 'READ system-config'` to its existing `data` object (guard is present but `data.permission` is `undefined`)
- [x] 2.4 In `frontend/src/app/app.routes.ts`, add `canActivate: [permissionGuard]` and `data: { permission: 'READ departments' }` to the `admin/departamentos` list route (`path: ''` child)
- [x] 2.5 In `frontend/src/app/app.routes.ts`, add `canActivate: [permissionGuard]` and `data: { permission: 'READ organizations' }` to the `admin/organizaciones` list route (`path: ''` child)

## Phase 3: Manual Verification

- [ ] 3.1 Verify `reporter` role navigating directly to `/app/admin/users` is redirected to `/app/dashboard` (not 200)
- [ ] 3.2 Verify `reporter` role navigating directly to `/app/admin/roles` is redirected to `/app/dashboard`
- [ ] 3.3 Verify `reporter` role navigating directly to `/app/admin/config` is redirected to `/app/dashboard`
- [ ] 3.4 Verify `master` role can still access all five admin list routes without redirect
- [ ] 3.5 Verify `operador_sistema` can access `/admin/config` after migration 0070 is applied
- [ ] 3.6 Verify no redirect loops occur for any role (all redirects land at an accessible page)
