# Design: Admin Route Guard Gap

## Technical Approach

Close the privilege-escalation gap by adding `canActivate: [permissionGuard]` with the correct `data.permission` string to every unguarded admin list route in `app.routes.ts`. Fix the broken `/admin/config` guard (missing `data.permission` key). Add one migration (0070) for the only missing catalog row: `READ system-config`. No guard logic changes -- `permissionGuard` already works correctly.

## Architecture Decisions

### D1: Per-route guard vs parent shell guard

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Per-route `canActivate` on each child | Verbose but granular; each route declares its own permission string | **Chosen** |
| Single guard on `admin` parent shell | Less repetition but forces one permission for all admin children, or requires the guard to inspect child route data -- neither matches the existing codebase pattern | Rejected |

**Rationale**: The codebase already uses per-route guards everywhere (`roles/:rolId`, `controles`, `audit-logs`, `departamentos/new`, `departamentos/:id/edit`, `organizaciones/new`, `organizaciones/:id/edit`). Following the established pattern keeps the mental model consistent and allows different permissions per route without guard logic changes.

### D2: Permission strings per route

| Route path | `data.permission` | Catalog exists? | Roles with grant |
|---|---|---|---|
| `admin/users` (list, `path: ''`) | `READ users` | Yes (0009) | master, operador_sistema, admin_org, operador_org |
| `admin/roles` (list) | `READ roles` | Yes (0009) | master, operador_sistema, admin_org, operador_org |
| `admin/config` | `READ system-config` | **No -- migration 0070** | master, operador_sistema |
| `admin/departamentos` (list, `path: ''`) | `READ departments` | Yes (0057) | master, admin_org |
| `admin/organizaciones` (list, `path: ''`) | `READ organizations` | Yes (0015) | master, operador_sistema, admin_org, operador_org |

### D3: Migration schema for `READ system-config`

Only one migration is needed (not two as the proposal estimated). `READ organizations` already exists in the catalog (0015) and is already granted to 4 staff roles. No new rows or grants needed for it.

Migration 0070 follows the established pattern (0049/0050/0052/0053/0057):

1. `INSERT INTO permissions (resource, action) VALUES ('system-config', 'READ') ON CONFLICT DO NOTHING`
2. `UPDATE roles SET permissions = (jsonb_agg(DISTINCT elem) ...)` for `master` and `operador_sistema`
3. `UPDATE users SET permissions = r.permissions, permission_version = permission_version + 1` for active users of those roles
4. `.DOWN.sql` sibling: remove UUID from role arrays, bump version, soft-delete catalog row

Grant targets: `master` and `operador_sistema` -- these are the only roles that should manage system configuration. `admin_org` and `operador_org` are scoped to their organization and should not access global system config.

Cache invalidation: the `permission_version` bump invalidates `perm:v3:uid:*` Redis keys automatically (T3.9 design).

### D4: Migration numbering

Last migration: `0069_emergency_dispatch.sql`. Next available: **0070**.

File: `database/migrations/0070_system_config_permission.sql`
Rollback: `database/rollback/0070_system_config_permission.DOWN.sql`

### D5: `/admin/config` fix

The route already has `canActivate: [permissionGuard]` (line 176) but is missing `data: { permission: '...' }`. When `permissionGuard` reads `route.data['permission']` and gets `undefined`, it returns `true` (line 28-29 of `permission.guard.ts`), silently allowing any authenticated user through. Fix: add `permission: 'READ system-config'` to the existing `data` object.

## Data Flow

```
Browser URL ──→ Angular Router ──→ permissionGuard(route)
                                        │
                                   route.data.permission
                                        │
                                   AuthService.currentUser()
                                        │
                                   user.permissions.includes(perm)
                                        │
                              ┌─────────┴─────────┐
                           allowed             denied
                              │                    │
                        render component    router.navigate('/app/dashboard')
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/app/app.routes.ts` | Modify | Add `canActivate` + `data.permission` to 4 list routes; fix `admin/config` `data` object |
| `database/migrations/0070_system_config_permission.sql` | Create | `READ system-config` catalog row + grants to master, operador_sistema |
| `database/rollback/0070_system_config_permission.DOWN.sql` | Create | Symmetric rollback for 0070 |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Manual | Reporter navigating to each admin URL is redirected | Browser test with reporter account |
| Manual | Master can still access all admin routes | Browser test with master account |
| Manual | Migration applies and rolls back cleanly | Run UP then DOWN on test DB |

No new unit tests needed -- `permissionGuard` is already tested and its logic is unchanged. The change is purely declarative route configuration plus a data migration.

## Threat Matrix

N/A -- no routing logic, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary changes. Only declarative route metadata and SQL data rows.

## Migration / Rollout

1. Apply migration 0070 (creates catalog row, grants to roles, denormalizes to users)
2. Deploy frontend with updated `app.routes.ts`
3. Order is not critical -- if frontend deploys first, `/admin/config` will deny access until 0070 runs (safe failure mode: users see dashboard redirect, not a crash). The other 4 routes use permissions that already exist.

## Open Questions

None -- all permission strings verified against existing catalog, all role grants confirmed.
