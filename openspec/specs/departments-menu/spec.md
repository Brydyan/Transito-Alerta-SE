# Departments Menu Specification

## Purpose

Full-stack CRUD management screen for organizational departments. Connects the
existing DepartmentsService/Repository (Phase B) to REST endpoints and an
Angular UI. Enforces RBAC scoping: master manages all orgs, admin_org is
restricted to their own organization.

## Requirements

### Requirement: Department List API

The backend MUST expose `GET /api/departments` returning a paginated response
`{ items, total }` where each item includes: `id`, `name`, `description`,
`organization_id`, `organization_name`, `user_count` (active users only),
`created_at`. Query params: `page` (default 1), `limit` (10|20|50, default 10),
`search` (optional, ILIKE on `name`). Admin_org requests MUST be silently
scoped to `organization_id = user.organizationId`; master MAY pass an optional
`organizationId` filter.

`user_count` MUST equal `COUNT(users WHERE department_id = d.id AND deleted_at IS NULL)`.

#### Scenario: master lists all departments

- GIVEN a master user with no org filter
- WHEN `GET /api/departments` is called
- THEN response status is 200 and `items` contains departments from all organizations
- AND each item includes `organization_name` and `user_count >= 0`

#### Scenario: admin_org sees only own-org departments

- GIVEN an admin_org user belonging to org A
- WHEN `GET /api/departments` is called (even with `organizationId` param set to org B)
- THEN response contains only departments where `organization_id = A`

#### Scenario: search by name

- GIVEN departments named "Operaciones", "Operacion Sur", "Logistica"
- WHEN `GET /api/departments?search=opera`
- THEN `items` contains only "Operaciones" and "Operacion Sur" (case-insensitive)

#### Scenario: pagination defaults

- GIVEN 25 existing departments
- WHEN `GET /api/departments` with no pagination params
- THEN `total` is 25, `items.length` is 10, and items are ordered by `created_at DESC`

#### Scenario: invalid page size is rejected

- GIVEN a request with `limit=99`
- THEN response status is 400

---

### Requirement: Department Create API

`POST /api/departments` MUST require `WRITE departments` permission. Body:
`{ name: string (required, max 255), description?: string (max 500), organization_id?: uuid }`.
Admin_org MUST ignore any provided `organization_id` and use `user.organizationId`.
Master MUST use the provided `organization_id` (required for master). `name`
MUST be unique per organization (case-insensitive); duplicate returns 409.

#### Scenario: admin_org creates department

- GIVEN an admin_org user in org A with `WRITE departments` permission
- WHEN `POST /api/departments { name: "Seguridad", description: "..." }`
- THEN response status is 201 and `organization_id` equals org A regardless of body

#### Scenario: master creates department for a specific org

- GIVEN a master user
- WHEN `POST /api/departments { name: "Seguridad", organization_id: "org-B-uuid" }`
- THEN response status is 201 and `organization_id` equals org B

#### Scenario: duplicate name in same org

- GIVEN a department named "Seguridad" already exists in org A
- WHEN `POST /api/departments { name: "seguridad" }` from an admin_org in org A
- THEN response status is 409

#### Scenario: name too long

- WHEN `POST /api/departments { name: "x".repeat(256) }`
- THEN response status is 400

---

### Requirement: Department Update API

`PATCH /api/departments/:id` MUST require `WRITE departments` permission.
Updatable fields: `name`, `description`. `organization_id` MUST NOT be changeable
via this endpoint. Admin_org MUST receive 403 if `:id` belongs to a different org.
Master may update any department. Uniqueness constraint (name + org) applies to
the updated value.

#### Scenario: admin_org updates own-org department

- GIVEN department D belonging to org A, and an admin_org in org A
- WHEN `PATCH /api/departments/D { name: "Nuevo Nombre" }`
- THEN response status is 200 and `name` is updated

#### Scenario: admin_org blocked on cross-org department

- GIVEN department D belonging to org B, and an admin_org in org A
- WHEN `PATCH /api/departments/D { name: "Hack" }`
- THEN response status is 403

#### Scenario: department not found

- WHEN `PATCH /api/departments/non-existent-id`
- THEN response status is 404

---

### Requirement: Department Soft-Delete API

`DELETE /api/departments/:id` MUST require `DELETE departments` permission.
The operation MUST set `deleted_at = now()` (soft delete). Admin_org MUST
receive 403 for cross-org IDs. Master may delete any department.
Response on success: 200 `{ id, deleted_at }`.

#### Scenario: successful soft-delete

- GIVEN department D in org A, admin_org user in org A
- WHEN `DELETE /api/departments/D`
- THEN `deleted_at` is set and department no longer appears in list responses

#### Scenario: reporter cannot delete

- GIVEN a reporter user
- WHEN `DELETE /api/departments/any-id`
- THEN response status is 403

---

### Requirement: Department List Screen

The frontend MUST render `/app/departamentos` as a paginated table with columns:
**Name | Description | Organization | Users | Created | Actions**. Search field
MUST debounce at 400 ms before issuing a new API request. Skeleton loader MUST
display while the initial request is in flight. Empty-state component MUST show
when `total === 0`. Column `Organization` MUST be hidden for admin_org users
(they only see their own org). Default sort: `created_at DESC` (not user-sortable).

#### Scenario: list loads successfully

- GIVEN a user with `READ departments` permission navigates to `/app/departamentos`
- WHEN the component initializes
- THEN a skeleton loader is shown during the request and replaced by the table on success

#### Scenario: empty state

- GIVEN the org has no departments
- WHEN the list renders
- THEN the EmptyStateComponent is displayed and no table rows are shown

#### Scenario: search debounce

- GIVEN the list is loaded
- WHEN the user types "oper" (4 keystrokes within 400 ms)
- THEN exactly one API request is sent after 400 ms of inactivity

#### Scenario: reporter sees list (read-only)

- GIVEN a reporter user with `READ departments` (if granted)
- WHEN viewing the list
- THEN Create, Edit, and Delete action buttons are NOT rendered
- AND the table displays correctly

---

### Requirement: Department Create Form

`/app/departamentos/new` MUST be protected by `permissionGuard` requiring
`WRITE departments`. The form MUST be a full page (not a modal) with fields:
`name` (required, max 255) and `description` (optional, max 500). Client-side
validation MUST run on submit. Server-side errors (409 duplicate, 400 invalid)
MUST display as inline field errors. On success, a toast MUST confirm creation
and the router MUST navigate to `/app/departamentos`.

#### Scenario: successful creation

- GIVEN valid name and optional description
- WHEN the user submits the form
- THEN a success toast is shown and the user is redirected to the list

#### Scenario: empty name blocked client-side

- WHEN the user submits with an empty name field
- THEN an inline validation error appears and no API call is made

#### Scenario: duplicate name (server error)

- GIVEN the server returns 409
- WHEN the form is submitted
- THEN the name field shows "Ya existe un departamento con este nombre en tu organización"
- AND no navigation occurs

---

### Requirement: Department Edit Form

`/app/departamentos/:id/edit` MUST be protected by `permissionGuard` requiring
`WRITE departments`. The form MUST pre-load existing `name` and `description`
from `GET /api/departments/:id`. `organization_id` MUST be shown read-only (not
editable). If the department was soft-deleted between page load and submission,
the server MUST return 404 and the client MUST show an error toast and navigate
back to the list. Unsaved changes MUST prompt a browser confirmation dialog on
navigation away.

#### Scenario: pre-load on edit

- GIVEN department D with name "Logistica"
- WHEN the user navigates to `/app/departamentos/D/edit`
- THEN the name field is pre-filled with "Logistica"

#### Scenario: department deleted mid-edit

- GIVEN department D is deleted by another admin while the edit form is open
- WHEN the user submits the edit form
- THEN the server returns 404, a toast shows "El departamento ya no existe", and navigation goes to the list

#### Scenario: dirty-form navigation guard

- GIVEN the user has modified the name field without saving
- WHEN the user attempts to navigate away
- THEN a browser confirmation dialog asks "¿Descartar cambios?"

---

### Requirement: Department Delete Confirmation

A Delete action button MUST appear in the Actions column only for users with
`DELETE departments`. Clicking it MUST open a `ConfirmDialogService` dialog with:
title "Eliminar departamento", message "¿Estás seguro de que deseas eliminar
**{name}**?", and if `user_count > 0` an additional warning "Este departamento
tiene {user_count} usuario(s) asignado(s)." On confirmation, a `DELETE` request
is sent; on success a toast confirms deletion and the list reloads.

#### Scenario: delete with no assigned users

- GIVEN department D with `user_count = 0`
- WHEN Delete is clicked and confirmed
- THEN `DELETE /api/departments/D` is called, a success toast shows, and the row disappears

#### Scenario: delete warning when users are assigned

- GIVEN department D with `user_count = 3`
- WHEN Delete is clicked
- THEN the dialog includes the warning "Este departamento tiene 3 usuario(s) asignado(s)."

#### Scenario: delete cancelled

- WHEN the user dismisses the confirmation dialog
- THEN no API call is made and the list is unchanged

---

### Requirement: RBAC Permission Enforcement

| Role | List | Create | Edit | Delete |
|------|------|--------|------|--------|
| master | all orgs | any org | any dept | any dept |
| admin_org | own org only | own org | own org only | own org only |
| reporter | own org (if READ granted) | no | no | no |

The menu entry for Departments MUST only appear when the user has `READ departments`.
`HasPermissionDirective` MUST hide Create/Edit/Delete buttons when permission is absent.

#### Scenario: admin_org cannot access cross-org dept via direct URL

- GIVEN admin_org user in org A
- WHEN they navigate directly to `/app/departamentos/org-B-dept-id/edit`
- THEN `PATCH` returns 403 on submit and the client shows an error toast

#### Scenario: menu entry hidden for insufficient permission

- GIVEN a user without `READ departments`
- WHEN they log in and the menu is rendered
- THEN the Departamentos menu entry is NOT shown

---

### Requirement: Menu Integration

The departments entry MUST be registered in `menu-map.ts` as:
`{ label: 'Departamentos', icon: 'building', route: '/app/departamentos', permission: 'READ departments' }`.
The entry MUST appear under the "Administración" group, after "Organizaciones"
and before "Usuarios". Breadcrumb MUST show: Administración > Departamentos.

#### Scenario: menu placement

- GIVEN a master user
- WHEN the admin sidebar renders
- THEN "Departamentos" appears in the Administración group, positioned after "Organizaciones"
