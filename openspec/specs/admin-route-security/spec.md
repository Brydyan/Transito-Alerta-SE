# Admin Route Security Specification

**Change**: `front/2026-10-14-admin-route-guards`
**Domain**: `admin-route-security`
**Type**: New spec (no prior domain spec exists)

---

## Purpose

Enforce frontend route-level permission guards on all admin list/read routes so
that authenticated users without the required permission are redirected instead
of served protected pages directly by URL. Covers 7 previously unguarded routes
and 1 broken guard, plus 2 new permission catalog rows in the database.

---

## Requirements

### Requirement: Admin List Routes MUST enforce permissionGuard

Every admin list/read route MUST declare `canActivate: [permissionGuard]` and a
`data.permission` key whose value is an existing permission string. A route
that carries `canActivate: [permissionGuard]` but omits `data.permission` MUST
NOT silently pass — the guard MUST treat a missing permission key as a denial.

Affected routes:

| Route | Permission string | Authorized roles |
|---|---|---|
| `/app/admin/users` | `READ users` | `master`, `admin_org`, `operador_sistema` |
| `/app/admin/roles` | `READ roles` | `master`, `admin_org`, `operador_sistema` |
| `/app/admin/config` | `READ system-config` | `master`, `operador_sistema` |
| `/app/admin/departamentos` | `READ departments` | `master`, `admin_org`, `operador_sistema` |
| `/app/admin/organizaciones` | `READ organizations` | `master`, `admin_org` |

> **Fuera de scope de este change**: Las rutas `/app/admin/audit-logs`
> (ya tenía guard — `READ audit-logs` desde `2026-09-11-f6-audit-logs-export`),
> `/app/admin/geo-zonas` (ruta no creada), y `/app/admin/reportes` (ruta no
> creada) no son parte de este change.

#### Scenario: Authorized role accesses guarded admin list — users

- GIVEN a user with role `master` is authenticated
- WHEN they navigate to `/app/admin/users`
- THEN the route activates and the users list component renders
- AND no redirect occurs

#### Scenario: Unauthorized role is redirected from admin users list

- GIVEN a user with role `reporter` is authenticated
- WHEN they navigate directly by URL to `/app/admin/users`
- THEN `permissionGuard` denies activation
- AND the router redirects to `/app`
- AND the users list component is never rendered

#### Scenario: Authorized role accesses roles list

- GIVEN a user with role `admin_org` is authenticated
- WHEN they navigate to `/app/admin/roles`
- THEN the route activates and the roles list component renders

#### Scenario: Unauthorized role is redirected from roles list

- GIVEN a user with role `reporter` is authenticated
- WHEN they navigate directly by URL to `/app/admin/roles`
- THEN the router redirects to `/app`

#### Scenario: Authorized role accesses departments list

- GIVEN a user with role `admin_org` is authenticated
- WHEN they navigate to `/app/admin/departamentos`
- THEN the route activates and the departments list component renders

#### Scenario: Unauthorized role is redirected from departments list

- GIVEN a user with role `reporter` is authenticated
- WHEN they navigate directly by URL to `/app/admin/departamentos`
- THEN the router redirects to `/app`

#### Scenario: Authorized role accesses organizations list

- GIVEN a user with role `admin_org` is authenticated
- WHEN they navigate to `/app/admin/organizaciones`
- THEN the route activates and the organizations list component renders

#### Scenario: Unauthorized role is redirected from organizations list

- GIVEN a user with role `reporter` is authenticated
- WHEN they navigate directly by URL to `/app/admin/organizaciones`
- THEN the router redirects to `/app`

---

### Requirement: Broken /admin/config guard MUST be fixed

The route `/app/admin/config` already carries `canActivate: [permissionGuard]`
but has no `data.permission` key. The guard MUST NOT pass silently when
`data.permission` is absent. After the fix, `data.permission` MUST be set to
`READ system-config` so the guard can evaluate the claim.

#### Scenario: operador_sistema accesses config page after fix

- GIVEN a user with role `operador_sistema` is authenticated
- AND `data.permission` is set to `READ system-config`
- WHEN they navigate to `/app/admin/config`
- THEN the route activates and the config component renders

#### Scenario: reporter is blocked from config page after fix

- GIVEN a user with role `reporter` is authenticated
- AND `data.permission` is set to `READ system-config`
- WHEN they navigate directly by URL to `/app/admin/config`
- THEN `permissionGuard` denies activation
- AND the router redirects to `/app`

#### Scenario: config page was previously bypassed without data.permission

- GIVEN the guard is in place but `data.permission` is absent (pre-fix state)
- WHEN any authenticated user navigates to `/app/admin/config`
- THEN the guard silently passes and the config page renders regardless of role
- AND this MUST NOT be the behavior after the fix is applied

---

### Requirement: READ system-config permission MUST exist in the catalog

A permission catalog row for `READ system-config` MUST be created via a
database migration. The permission MUST be granted to the roles `master` and
`operador_sistema`. The migration MUST be idempotent and MUST have a
`.DOWN.sql` sibling that revokes grants and removes the catalog row.

#### Scenario: master role holds READ system-config after migration

- GIVEN the migration for `READ system-config` has been applied
- WHEN the system resolves permissions for a user with role `master`
- THEN `READ system-config` is present in their effective permission set

#### Scenario: operador_sistema holds READ system-config after migration

- GIVEN the migration for `READ system-config` has been applied
- WHEN the system resolves permissions for a user with role `operador_sistema`
- THEN `READ system-config` is present in their effective permission set

#### Scenario: reporter does NOT hold READ system-config

- GIVEN the migration for `READ system-config` has been applied
- WHEN the system resolves permissions for a user with role `reporter`
- THEN `READ system-config` is NOT present in their effective permission set

#### Scenario: migration rolls back cleanly

- GIVEN the migration for `READ system-config` has been applied
- WHEN the `.DOWN.sql` sibling is executed
- THEN the `READ system-config` catalog row is removed
- AND all grants for that permission are revoked
- AND the database returns to its prior state

---

### Requirement: READ organizations permission MUST exist in the catalog

A permission catalog row for `READ organizations` MUST be created via a
database migration. The permission MUST be granted to the roles `master` and
`admin_org`. The migration MUST be idempotent and MUST have a `.DOWN.sql`
sibling.

#### Scenario: master role holds READ organizations after migration

- GIVEN the migration for `READ organizations` has been applied
- WHEN the system resolves permissions for a user with role `master`
- THEN `READ organizations` is present in their effective permission set

#### Scenario: admin_org holds READ organizations after migration

- GIVEN the migration for `READ organizations` has been applied
- WHEN the system resolves permissions for a user with role `admin_org`
- THEN `READ organizations` is present in their effective permission set

#### Scenario: reporter does NOT hold READ organizations

- GIVEN the migration for `READ organizations` has been applied
- WHEN the system resolves permissions for a user with role `reporter`
- THEN `READ organizations` is NOT present in their effective permission set

#### Scenario: migration rolls back cleanly

- GIVEN the migration for `READ organizations` has been applied
- WHEN the `.DOWN.sql` sibling is executed
- THEN the `READ organizations` catalog row is removed
- AND all grants for that permission are revoked

---

### Requirement: reporter MUST NOT reach any admin route

A user with role `reporter` MUST be redirected away from every route under
`/app/admin/*` regardless of how they arrive (sidebar navigation, direct URL,
deep link, or browser history navigation). No admin list or detail page MUST
render for a reporter.

#### Scenario: reporter cannot access any admin route via direct URL

- GIVEN a user with role `reporter` is authenticated
- WHEN they navigate directly by URL to any of the routes:
  `/app/admin/users`, `/app/admin/roles`, `/app/admin/config`,
  `/app/admin/departamentos`, `/app/admin/organizaciones`
- THEN for each route `permissionGuard` denies activation
- AND the router redirects to `/app`
- AND no admin component renders

#### Scenario: no redirect loop occurs for reporter

- GIVEN a user with role `reporter` is authenticated
- WHEN `permissionGuard` redirects them from an admin route to `/app`
- THEN the `/app` route activates without triggering another guard redirect
- AND the user lands on a stable page

---

### Requirement: No guard changes for master role access

A user with role `master` MUST be able to access all admin routes after the
guards are applied, because `master` holds all relevant permissions in the
catalog.

#### Scenario: master accesses all guarded admin routes without redirect

- GIVEN a user with role `master` is authenticated
- WHEN they navigate to any admin route in scope
- THEN every route activates successfully
- AND no redirect to `/app` occurs

---

## Out of Scope

The following are explicitly excluded from this spec:

- `/app/dashboard` guard behavior (redirect loop risk — separate change)
- `/app/categorias` list guard (`READ incident-categories` — product decision pending)
- `/app/reportes/listado-clientes` guard
- Citizen routes (`/inicio`, `/mapa`, `/reportar`, `/incidencias`)
- Backend endpoint authorization (enforced separately by NestJS guards)
- Changes to `permissionGuard` implementation logic
