# Proposal: T5.4 Map UI Support — Map Filters + Users Form-Data

Port reference:
- `GeoReporta/backend/app/Domains/Incidents/Http/MapFilterController.php`
- `GeoReporta/backend/app/Domains/Users/Http/UserController.php` (method `formData`)

No new DB migrations needed.

## Intent

The GeoReporta frontend map needs two lightweight reference-data endpoints:
1. `GET /map/filters` — category list for the map's filter dropdown (auth-only, no specific permission).
2. `GET /users/form-data` — roles + organizations for user management forms (gated on user management access).

Both endpoints exist in GeoReporta but are absent from NestJS. They are pure read-only queries
on existing tables — no new entities, no new tables.

## Scope

### In Scope

- `MapSupportService`:
  - `getMapFilters()` — `SELECT id, name FROM incident_categories ORDER BY name`. No org scope
    (categories are global in the NestJS schema). Returns `{data: {categories: [...]}}`.
- `UsersService` (existing) — add `getFormData(currentUser)` method:
  - Roles query: `SELECT id, name FROM roles ORDER BY name`. For non-system-admins, excludes
    system-only roles (`admin_sistema`, `operador_sistema`, `admin_legacy`).
  - Organizations query: `SELECT id, name FROM organizations ORDER BY name`. For non-system-admins,
    filters to `WHERE id = currentUser.organizationId`.
  - Returns `{roles: [...], organizations: [...]}`.
- New `MapController` in a thin `map` module (or extend `IncidentCategoriesModule` — see Approach):
  - `GET /api/map/filters` — `JwtAuthGuard` only, no permission gate (mirrors legacy: auth
    required but not `incident-categories.view`).
- `UsersController` (existing) — add `GET /api/users/form-data` endpoint:
  - `@RequirePermissions('READ users')` — same gate as `viewAny` in GeoReporta.
- DTOs: `MapFilterResponseDto`, `FormDataResponseDto`.
- Unit tests: category query, org-filtered roles query, non-admin org restriction.
- E2e tests: map filters returns 200 with categories, form-data returns org-restricted list for
  org-admin caller, system-admin sees all roles and all orgs.

### Out of Scope

- Statuses filter on the map (those come from the status catalog endpoint in T5.1).
- Zone / location reference data (not in GeoReporta's `MapFilterController` scope).
- Pagination on reference data (lists are small enough to return in full).

## Capabilities

### New Capabilities
- `map-ui-support`: map filter catalog + users form-data reference query.

### Modified Capabilities
- `users` module: gains `getFormData` method + controller route.

## Approach

`GET /api/map/filters` is the simplest endpoint in the entire migration — a single `SELECT` on
`incident_categories`. Rather than creating a new module just for it, the endpoint lives in a new
`MapModule` that imports `IncidentCategoriesModule` (already wired) and exposes a `MapController`.
This avoids circular imports and keeps concern separation clean.

`GET /api/users/form-data` is an additive method on the existing `UsersService` and
`UsersController`. The org-scoping logic is a direct port of GeoReporta's `formData()` method —
the role exclusion list (`admin_sistema`, `operador_sistema`, `admin_legacy`) is hardcoded as
constants in the service (same as GeoReporta's `UserRole` enum).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/modules/map/` | New | Thin module + `MapController` + `MapSupportService` |
| `backend/src/modules/users/users.service.ts` | Modified | `getFormData(currentUser)` method |
| `backend/src/modules/users/users.controller.ts` | Modified | `GET /api/users/form-data` route |
| `backend/src/app.module.ts` | Modified | Import `MapModule` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `IncidentCategoriesModule` not exported for `MapModule` | Low | Make `IncidentCategoryRepository` or raw `DataSource` available via module export |
| Role name constants drift from DB seed | Low | Use string constants from a shared `role-names.const.ts` file, same as RBAC guards |

## Rollback Plan

1. Remove `MapModule` — no DB changes.
2. Remove `getFormData` method from `UsersService` and the controller route.

## Dependencies

- T2.1 Incidents module (incident categories table already seeded).
- T3.1 Roles + T3.2 Organizations (tables exist, queried directly).
- T3.6 Invitations (permission infrastructure for `READ users`).

## Success Criteria

- [ ] `GET /api/map/filters` returns `{data: {categories: [{id, name}, ...]}}` sorted by name.
- [ ] Unauthenticated request to `/api/map/filters` returns 401.
- [ ] `GET /api/users/form-data` returns `{roles, organizations}` for system admin — all roles, all orgs.
- [ ] Org-admin caller receives only non-system roles and only their own organization.
- [ ] Caller without `READ users` permission gets 403.
- [ ] `npm test && npm run test:e2e` green.
