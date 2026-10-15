# Proposal: Admin Route Guard Gap

## Intent

Every admin list/read route (`/app/admin/users`, `/app/admin/roles`, `/app/admin/config`, `/app/admin/departamentos`, `/app/admin/organizaciones`) lacks `permissionGuard` or has a broken guard (missing `data.permission` key). The sidebar `MENU_MAP` hides links per role, but any authenticated user -- including `reporter` -- can navigate directly by URL to admin pages exposing PII and system configuration. This is a privilege-escalation vulnerability that must be closed before production.

## Scope

### In Scope
- Add `permissionGuard` + correct `data.permission` to 7 admin list routes in `app.routes.ts`
- Fix `/admin/config` broken guard (has `canActivate: [permissionGuard]` but missing `data.permission` key -- guard silently passes)
- New DB migration: `READ system-config` permission catalog row, granted to `master` and `operador_sistema`
- New DB migration: `READ organizations` permission catalog row, granted to `master` and `admin_org`

### Out of Scope
- `/app/dashboard` guard (redirect loop risk for `reporter` -- separate change)
- `/app/categorias` list (`READ incident-categories` -- product decision pending)
- `/app/reportes/listado-clientes`
- Citizen routes (`/inicio`, `/mapa`, `/reportar`, `/incidencias`) -- backend enforced, reporter already holds permissions
- Backend endpoint authorization (already enforced by NestJS guards)

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `navigation`: Add `permissionGuard` + `data.permission` to all admin list routes
- `security-hardening`: Extend frontend authorization enforcement to read routes

## Approach

1. **Route-level guards**: Add `canActivate: [permissionGuard]` and `data: { permission: '<action> <resource>' }` to each unguarded admin route in `app.routes.ts`. Use existing permission strings where they exist in DB.
2. **Fix config guard**: Add `data: { permission: 'READ system-config' }` to the `/admin/config` route that already has the guard but silently passes.
3. **Two migrations**: One for `READ system-config` (grant to `master`, `operador_sistema`), one for `READ organizations` (grant to `master`, `admin_org`). Follow existing idempotent pattern with `.DOWN.sql` siblings.
4. **No guard logic changes**: `permissionGuard` already works correctly -- it reads `data.permission`, checks user permissions, and redirects on denial. The gap is purely in route configuration.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/app/app.routes.ts` | Modified | Add guard + data.permission to 7 admin routes, fix 1 broken guard |
| `database/migrations/00XX_*.sql` | New | `READ system-config` permission + grants |
| `database/migrations/00YY_*.sql` | New | `READ organizations` permission + grants |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Legitimate users locked out of routes they need | Low | Use existing DB permission strings; only 2 new catalog rows needed |
| Migration numbering collision with parallel branches | Low | Check latest migration number before creating |
| Guard redirect loop if user has no fallback route | Low | `permissionGuard` already redirects to `/app` which is accessible to all authenticated users |

## Rollback Plan

Revert the `app.routes.ts` changes (remove `canActivate` and `data` from affected routes). Run `.DOWN.sql` for both migrations to remove the new permission catalog rows and grants. No schema changes involved -- only permission data rows.

## Dependencies

- `permissionGuard` implementation must remain unchanged (verified: it reads `data.permission` correctly)
- Existing permission strings (`READ users`, `READ roles`, `READ departments`) must exist in DB (verified)

## Success Criteria

- [ ] Reporter role navigating to `/app/admin/users` is redirected away
- [ ] Reporter role navigating to `/app/admin/roles` is redirected away
- [ ] Reporter role navigating to `/app/admin/config` is redirected away
- [ ] `master` role can still access all admin routes
- [ ] `operador_sistema` can access `/admin/config`
- [ ] No redirect loops for any role
- [ ] Both migrations apply and roll back cleanly
