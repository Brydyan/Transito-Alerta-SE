# Spec: sc-337 — Menu Matrix 4 Permissions

**Change**: `2026-09-23-sc-menu-matrix-4-permisos`
**Domain**: menu-matrix-4-permisos

---

## Domain: menu-option-roles matrix (EXTEND)

### Requirement: GET /api/menu-options/:id/roles returns 4 permission fields

The role matrix endpoint MUST return all four CRUD permission bits for every
role entry.

- Scenario: Matrix response includes 4 fields — GIVEN a menu option with existing
  role assignments WHEN GET /api/menu-options/:id/roles is called THEN each
  `RoleMatrixEntry` in the response includes `can_read`, `can_create`, `can_update`,
  and `can_delete` boolean fields
- Scenario: New columns default false — GIVEN a role assignment created before
  migration 0065 WHEN GET /api/menu-options/:id/roles is called THEN
  `can_create`, `can_update`, and `can_delete` are all `false` for that entry
- Scenario: Previously set can_write preserved — GIVEN a role with `can_write: true`
  from before migration 0065 WHEN GET /api/menu-options/:id/roles is called THEN
  `can_write` is still `true` and the new fields are `false`

---

### Requirement: PUT /api/menu-options/:id/roles/:roleId validates prerequisite

Setting any of `can_create`, `can_update`, or `can_delete` to `true` without
`can_read: true` MUST be rejected with HTTP 422.

- Scenario: can_create without can_read → 422 — GIVEN a PUT request with
  `{ canRead: false, canCreate: true }` WHEN processed by setRoleAccess THEN
  the server returns 422 with message "can_create requires can_read"
- Scenario: can_update without can_read → 422 — GIVEN a PUT request with
  `{ canRead: false, canUpdate: true }` WHEN processed THEN 422 with
  message "can_update requires can_read"
- Scenario: can_delete without can_read → 422 — GIVEN a PUT request with
  `{ canRead: false, canDelete: true }` WHEN processed THEN 422 with
  message "can_delete requires can_read"
- Scenario: Multiple new permissions without can_read → 422 — GIVEN a PUT request
  with `{ canRead: false, canCreate: true, canUpdate: true, canDelete: true }`
  WHEN processed THEN 422 is returned
- Scenario: can_write without can_read still → 422 — GIVEN the existing rule
  WHEN a PUT request has `{ canRead: false, canWrite: true }` THEN 422 is
  returned (existing behavior preserved)
- Scenario: All permissions with can_read → 200 — GIVEN a PUT request with
  `{ canRead: true, canCreate: true, canUpdate: true, canDelete: true, canWrite: true }`
  WHEN processed THEN 200 is returned and all 5 values are persisted
- Scenario: Only can_read → 200 — GIVEN a PUT request with
  `{ canRead: true }` (all others absent or false) WHEN processed THEN 200 and
  only `can_read: true` is stored; `can_create`, `can_update`, `can_delete` default
  to `false`
- Scenario: can_create without can_write → 200 — GIVEN a PUT request with
  `{ canRead: true, canCreate: true, canWrite: false }` WHEN processed THEN 200;
  `can_write` is NOT required as a prerequisite for CRUD granular fields

---

### Requirement: Frontend admin matrix renders 4 permission checkboxes

The `RoleMatrixComponent` MUST render a "Crear", "Actualizar", and "Eliminar"
checkbox for each role row in addition to the existing "Lectura" and "Escritura"
checkboxes.

- Scenario: 5 checkboxes per role row — GIVEN the matrix is loaded WHEN a role
  row is rendered THEN it shows checkboxes for Lectura, Escritura, Crear,
  Actualizar, Eliminar
- Scenario: Crear/Actualizar/Eliminar disabled when Lectura is false — GIVEN a
  role with `can_read: false` WHEN rendered THEN the Crear, Actualizar, and
  Eliminar checkboxes are disabled
- Scenario: Turning Lectura off clears all other permissions — GIVEN a role with
  `can_read: true` and `can_create: true` WHEN the admin unchecks Lectura THEN
  the `accessChanged` event emits `can_read: false, can_create: false,
  can_update: false, can_delete: false, can_write: false`
- Scenario: accessChanged emits all 5 fields — GIVEN any checkbox is toggled
  WHEN toggleAccess emits THEN the event payload includes `role_id`, `can_read`,
  `can_write`, `can_create`, `can_update`, `can_delete`
- Scenario: MenuOptionsComponent relays all 5 fields to setRoleAccess — GIVEN
  an accessChanged event with all 5 fields WHEN onRoleAccessChange is called
  THEN the service call includes all 5 boolean fields in the payload

---

### Requirement: Sidebar (getAccessibleOptions) is unaffected

Adding 3 new columns MUST NOT change which menu items appear in the navigation
sidebar.

- Scenario: Sidebar filter unchanged — GIVEN a role with `can_read: true` and
  `can_create: false, can_update: false, can_delete: false` for a menu option
  WHEN the user navigates THEN that option appears in the sidebar (same as before)
- Scenario: New permissions do not add items — GIVEN a role with `can_read: false`
  but `can_create: true` for a menu option WHEN the user navigates THEN that
  option does NOT appear in the sidebar
- Scenario: PermissionGuard unchanged — GIVEN a route protected by
  `@RequirePermission('DELETE', 'menu-options')` WHEN a user with the guard
  permission UUID in `roles.permissions` accesses it THEN access is granted
  regardless of `menu_option_roles.can_delete`

---

### Requirement: Cache invalidation occurs after setRoleAccess

- Scenario: Cache flushed after PUT — GIVEN a PUT /api/menu-options/:id/roles/:roleId
  that persists successfully WHEN complete THEN `menu:v1:*` Redis keys are deleted
  (same as before — no change to invalidation behavior, confirmed by existing coverage)
