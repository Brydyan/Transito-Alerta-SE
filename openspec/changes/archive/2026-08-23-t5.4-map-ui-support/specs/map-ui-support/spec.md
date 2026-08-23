# Specification: map-ui-support

## Purpose

Define the behavioral contract for the map filter catalog and users form-data reference endpoints.
These are lightweight read-only endpoints that supply dropdown data to the frontend.

## Scope Summary

**In scope**: `GET /api/map/filters`, `GET /api/users/form-data`.

**Not additive to schema** — reads from existing `incident_categories`, `roles`, `organizations`.

## Requirements

### R1 — Map Filters

Authentication (JWT) is required. No specific RBAC permission is required beyond a valid token.

The endpoint MUST return all `incident_categories` sorted alphabetically by `name`.

Response shape: `{data: {categories: [{id: string, name: string}, ...]}}`.

No org scoping — categories are global in the NestJS schema.

Results MAY be cached in Redis (optional; not required by spec but recommended for performance).

### R2 — Users Form-Data

`READ users` permission is required.

For `admin_sistema` callers:
- `roles`: all roles from the `roles` table, sorted by `name`.
- `organizations`: all organizations from the `organizations` table, sorted by `name`.

For non-system-admin callers:
- `roles`: excludes system-only role names: `admin_sistema`, `operador_sistema`, `admin_legacy`.
- `organizations`: filtered to only the caller's own organization (`id = caller.organizationId`).

Response shape: `{roles: [{id, name}], organizations: [{id, name}]}`.

## Scenarios

### GET /api/map/filters

**Scenario 1: Authenticated user receives category list**
```
Given an authenticated user of any role
  And 3 incident categories exist: "Baches", "Alumbrado", "Tráfico"
When GET /api/map/filters is called
Then the response status is 200
  And the response body is {data: {categories: [{name: "Alumbrado"}, {name: "Baches"}, {name: "Tráfico"}]}}
  And categories are sorted alphabetically
```

**Scenario 2: Unauthenticated request returns 401**
```
Given no Authorization header
When GET /api/map/filters is called
Then the response status is 401
```

**Scenario 3: Empty categories table returns empty array**
```
Given no incident categories exist in the database
When GET /api/map/filters is called
Then the response status is 200
  And the response body is {data: {categories: []}}
```

**Scenario 4: Response includes id and name fields**
```
Given an authenticated user
When GET /api/map/filters is called
Then each category item in the response has id and name fields
  And no other fields are included
```

### GET /api/users/form-data

**Scenario 1: System admin receives all roles and all organizations**
```
Given an authenticated admin_sistema
  And roles: admin_sistema, admin_organizacion, operador_organizacion, usuario exist
  And organizations: org-A, org-B exist
When GET /api/users/form-data is called
Then the response status is 200
  And roles contains all 4 roles
  And organizations contains both org-A and org-B
```

**Scenario 2: Org-admin receives restricted roles and only their own organization**
```
Given an authenticated admin_organizacion of org-A
  And roles: admin_sistema, admin_organizacion, operador_organizacion, usuario, admin_legacy exist
When GET /api/users/form-data is called
Then the response roles does NOT include admin_sistema
  And the response roles does NOT include operador_sistema
  And the response roles does NOT include admin_legacy
  And the response organizations contains only org-A
```

**Scenario 3: Caller without READ users permission gets 403**
```
Given an authenticated usuario (citizen) without READ users permission
When GET /api/users/form-data is called
Then the response status is 403
```

**Scenario 4: Unauthenticated request returns 401**
```
Given no Authorization header
When GET /api/users/form-data is called
Then the response status is 401
```

**Scenario 5: Roles and organizations are sorted alphabetically**
```
Given an authenticated admin_sistema
When GET /api/users/form-data is called
Then roles are sorted by name ascending
  And organizations are sorted by name ascending
```
