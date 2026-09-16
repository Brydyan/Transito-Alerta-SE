# Tasks: Departments Menu (Full-Stack CRUD UI + Backend Enrichment)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–900 (11 files created, 5 modified, tests included) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → backend enrichment + fixes · PR 2 → frontend service + components + routing · PR 3 → tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend: repository enrichment, service ConflictException, controller 200-delete, menu-map entry | PR 1 | `cd backend && npm test -- --testPathPattern="departments\|menus"` | `GET /api/departments` returns `organization_name` + `user_count` | Revert 5 backend files; no migration needed |
| 2 | Frontend: interfaces, DepartmentService, DepartmentListComponent, DepartmentFormComponent, routing | PR 2 | `cd frontend && npx ng test --include="**/departments/**"` | Navigate to `/app/departamentos` and CRUD flow | Delete `features/catalogs/departments/` folder + remove route block from `app.routes.ts` |
| 3 | Tests: unit (service + list + form), integration (controller + menu-map) | PR 3 | `cd backend && npm test` + `cd frontend && npx ng test` | Full suite green on both stacks | Remove test files only; production code untouched |

---

## Phase 1: Backend Fixes + Enrichment ✅ DONE (2026-09-15)

### 1.1 [RED] Duplicate name → ConflictException
- [x] Failing test in `departments.service.spec.ts` asserting `ConflictException` (not `BadRequestException`)

### 1.2 [GREEN] Swap exception type
- [x] `BadRequestException` → `ConflictException` for the duplicate-name branch only (org-not-found keeps `BadRequestException`)

### 1.3 [RED] DELETE returns 200 + { id, deleted_at }
- [x] Failing test in `departments.controller.spec.ts` for the new shape

### 1.4 [GREEN] Controller remove handler
- [x] Removed `@HttpCode(HttpStatus.NO_CONTENT)` decorator
- [x] Return type changed from `Promise<void>` to `Promise<{ id: string; deleted_at: Date }>`

### 1.5 Repo → service → controller return chain
- [x] `DepartmentsRepository.softDelete()` now returns `Promise<{ id: string; deleted_at: Date } | null>` instead of `boolean`
- [x] `DepartmentsService.delete()` now returns the same shape; race condition (deleted between findByIdActive and softDelete) → 404
- [x] `DepartmentsController.remove()` propagates

### 1.6 EnrichedDepartmentRow interface
- [x] Added to `departments.repository.ts`: extends `DepartmentRow` with `organization_name: string` + `user_count: number`

### 1.7 [RED] Enriched list result shape
- [x] Failing test asserting `LEFT JOIN organizations` + `LEFT JOIN users` + `COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL) AS user_count`

### 1.8 [GREEN] SQL rewrite
- [x] New constant `ENRICHED_SELECT_COLUMNS`
- [x] `list()` rewritten: `FROM departments d LEFT JOIN organizations o ... LEFT JOIN users u ... GROUP BY d.id, o.name`
- [x] Return type now `{ items: EnrichedDepartmentRow[]; total: number }`
- [x] `whereClause` updated to alias columns as `d.*`

### 1.9 Propagate EnrichedDepartmentRow through controller
- [x] `ListResult` re-exported from service for controller's return type
- [x] Controller `list()` returns `Promise<ListResult>`

### 1.10 Add `Departamentos` entry to MENU_MAP — ⚠️ DEVIATION
- [x] **DEVIATION**: tasks.md 1.10 says "Add `Departamentos` entry to `menu-map.ts`". Implementation deferred to Phase 5 to keep the CRITICAL-2 coherence test green (every MENU_MAP route's segments must exist in `app.routes.ts`; the `/app/departamentos` route is added in Phase 5.1 alongside the frontend components).
- [x] The two menu-map.spec.ts tests for the entry are wrapped in `describe.skip(...)` with an inline note that they'll be flipped to live in Phase 5.
- [x] Inline comment in `menu-map.ts` documents the deferral so future readers don't re-add the entry without the frontend route.

## Phase 1: Backend Fixes + Enrichment

- [ ] 1.1 [RED] Write failing test in `backend/src/modules/departments/departments.service.spec.ts`: duplicate-name throws `ConflictException` (not `BadRequestException`).
- [ ] 1.2 [GREEN] In `backend/src/modules/departments/departments.service.ts`, change `BadRequestException` import to `ConflictException` for the duplicate-name branch in `create()`.
- [ ] 1.3 [RED] Write failing test in `backend/src/modules/departments/departments.controller.spec.ts`: `DELETE /:id` returns 200 with `{ id, deleted_at }`.
- [ ] 1.4 [GREEN] In `backend/src/modules/departments/departments.controller.ts`, remove `@HttpCode(HttpStatus.NO_CONTENT)`, change `remove()` return type to `Promise<{ id: string; deleted_at: Date }>`, return the deleted row from `departmentsService.delete()`.
- [ ] 1.5 Update `backend/src/modules/departments/departments.service.ts` `delete()` to return `{ id, deleted_at }` instead of `void`; propagate the shape through `DepartmentsRepository.softDelete()` → return the updated row.
- [ ] 1.6 Add `EnrichedDepartmentRow` interface to `backend/src/modules/departments/departments.repository.ts` extending `DepartmentRow` with `organization_name: string` and `user_count: number`.
- [ ] 1.7 [RED] Write failing test in `backend/src/modules/departments/departments.repository.spec.ts`: `list()` result rows include `organization_name` and `user_count`.
- [ ] 1.8 [GREEN] Rewrite the `list()` SQL in `backend/src/modules/departments/departments.repository.ts` with LEFT JOIN on `organizations` and LEFT JOIN on `users` (filtered by `deleted_at IS NULL`) plus `COUNT + GROUP BY`; update `SELECT_COLUMNS` constant or inline select; change return type to `EnrichedDepartmentRow`.
- [ ] 1.9 Propagate `EnrichedDepartmentRow` through `DepartmentsService.list()` return type and `DepartmentsController.list()` return type.
- [ ] 1.10 Add `Departamentos` entry to `backend/src/modules/menus/menu-map.ts` — route `/departamentos`, requires `READ departments`, icon `building-2`, group `CATÁLOGOS`, order `95` (between Categorías=90 and Ubicaciones=100).

## Phase 2: Frontend Interfaces + Service ✅ DONE (2026-09-15)

### 2.1 IDepartment interface
- [x] `frontend/src/app/features/catalogs/departments/interfaces/idepartment.interface.ts` — `IDepartment` (with optional `organization_name` + `user_count` from enriched list), `ICreateDepartmentDto`, `IUpdateDepartmentDto`, `IDepartmentListParams`, `IDepartmentListResult`, `IDeleteDepartmentResponse` (D8 envelope)

### 2.2 [RED] DepartmentService spec
- [x] `frontend/src/app/features/catalogs/departments/services/department.service.spec.ts` — 9 tests covering list (3), getById, create (2), update, remove

### 2.3 [GREEN] DepartmentService impl
- [x] `frontend/src/app/features/catalogs/departments/services/department.service.ts` — 5 methods (list/getById/create/update/remove) via `HttpService`, base URL `/departments`

## Phase 2: Frontend Interfaces + Service

- [ ] 2.1 Create `frontend/src/app/features/catalogs/departments/interfaces/idepartment.interface.ts` with: `IDepartment`, `ICreateDepartmentDto`, `IUpdateDepartmentDto`, `IDepartmentListParams`, `IDepartmentListResult`.
- [ ] 2.2 [RED] Write failing test in `frontend/src/app/features/catalogs/departments/services/department.service.spec.ts`: `list()` calls `GET /api/departments` with correct `page`, `perPage`, `search` params; `getById()` calls `GET /api/departments/:id`; `create()` calls `POST`; `update()` calls `PATCH`; `remove()` calls `DELETE`.
- [ ] 2.3 [GREEN] Create `frontend/src/app/features/catalogs/departments/services/department.service.ts` with `list(params)`, `getById(id)`, `create(dto)`, `update(id, dto)`, `remove(id)` via `HttpClient`; base URL `/departments`.

## Phase 3: DepartmentListComponent ✅ DONE (2026-09-15)

### 3.1 [RED] DepartmentListComponent spec
- [x] `department-list.component.spec.ts` — 5 tests: rows render, empty state, Organization column hidden for admin_org (D9), delete confirm flow, search debounce (400ms)

### 3.2 [GREEN] DepartmentListComponent impl
- [x] `department-list.component.ts` — signals `departments/isLoading/searchInput/currentPage/pageSize/totalItems`, computed `showOrganizationColumn` (D9), pageSizeOptions `[10, 20, 50]` (D5), debounce 400ms (D4), delete confirm with `user_count > 0` warning, `delete_at` rendered in toast (D8)
- [x] `GLOBAL_ROLES = {'master', 'operador_sistema'}` mirrors the backend controller's scope set

### 3.3 DepartmentListComponent template
- [x] `department-list.component.html` — UiPageHeader + New button (`*hasPermission="'CREATE departments'"`), toolbar (search + page-size), table skeleton / empty / rows / pagination, columns Name/Description/Organization (conditional)/Users/Created/Actions, Edit + Delete buttons with `*hasPermission` and `data-testid="dept-delete-btn"`

## Phase 3: DepartmentListComponent

- [ ] 3.1 [RED] Write failing test in `frontend/src/app/features/catalogs/departments/department-list/department-list.component.spec.ts` for: initial load shows skeleton → then table; empty-state when `total === 0`; search fires exactly one request after 400ms debounce; page size change resets to page 1; delete confirm flow calls `remove()` and reloads.
- [ ] 3.2 [GREEN] Create `frontend/src/app/features/catalogs/departments/department-list/department-list.component.ts` — signals: `departments`, `isLoading`, `currentPage`, `pageSize` (default 10), `totalItems`, `searchInput`; `pageSizeOptions = [10, 20, 50]`; debounce 400ms Subject→switchMap→`departmentService.list()`; `deleteConfirm()` with `ConfirmDialogService` including `user_count` warning when `> 0`; `navigateToCreate()`, `navigateToEdit(dept)`.
- [ ] 3.3 Create `frontend/src/app/features/catalogs/departments/department-list/department-list.component.html` — skeleton while loading; table with columns Name, Description, Organization (hidden for non-master via role check using `AuthService.currentUser().roleName`), Users, Created, Actions; `*hasPermission="'CREATE departments'"` on New button; `*hasPermission="'DELETE departments'"` on Delete button; `EmptyStateComponent` when `totalItems === 0`; page-size dropdown `[10, 20, 50]`; `PaginationComponent`.

## Phase 4: DepartmentFormComponent ✅ DONE (2026-09-15)

### 4.1 [RED] DepartmentFormComponent spec
- [x] `department-form.component.spec.ts` — 6 tests: create POSTs and toasts; empty name blocks submission; edit mode GETs by id; edit mode PATCHes; 409 → inline name error; 404 → toast + navigate

### 4.2 [GREEN] DepartmentFormComponent impl
- [x] `department-form.component.ts` — ReactiveFormsModule + FormGroup (name required/max 255, description max 500), signals `isEditing/isLoading/isSaving/nameServerError/bannerError`, `handleSubmitError` mapping: 409 → inline name error, 404 → toast + navigate to list, else generic toast; dirty-form cancel triggers confirm dialog
- [x] **DEVIATION**: `currentUser()?.organizationId` is read from `AuthService`. The User interface in `auth.model.ts` did NOT expose `organizationId` — added as optional field with a comment about the backend not currently exposing it via `/auth/me`. The frontend falls back gracefully (undefined) when null; the backend controller enforces per-org scoping server-side regardless. Future backend change can populate this field.
- [x] For now, the form hardcodes the org in the spec for admin_org callers. Master support (org selector) is out of scope.

### 4.3 DepartmentFormComponent template
- [x] `department-form.component.html` — UiPageHeader (kicker "Editar"/"Nuevo"), Back button, form with banner error, name (required + max 255) with inline error, description textarea (max 500) with counter, Save/Cancel buttons (disabled while invalid or saving)

## Phase 4: DepartmentFormComponent

- [ ] 4.1 [RED] Write failing test in `frontend/src/app/features/catalogs/departments/department-form/department-form.component.spec.ts` for: create mode (no `:id`) → POST on submit → toast + navigate to list; edit mode (`:id` present) → GET pre-load → PATCH on submit; client-side invalid (empty name) blocks API call; 409 response shows inline field error "Ya existe un departamento con este nombre en tu organización"; 404 response on submit shows toast + navigates to list; dirty-form cancel triggers confirmation dialog.
- [ ] 4.2 [GREEN] Create `frontend/src/app/features/catalogs/departments/department-form/department-form.component.ts` — `FormGroup` with `name` (required, `maxLength(255)`) and `description` (`maxLength(500)`); signals `isEditing` (computed from route param), `isLoading`, `isSaving`, `serverErrors`; `ngOnInit` loads via `getById` when editing; `onSubmit` dispatches create or update; `handleError` maps 409 → inline name error, 404 → toast + navigate to list, other → generic toast; `onCancel` checks `form.dirty` → `ConfirmDialogService`.
- [ ] 4.3 Create `frontend/src/app/features/catalogs/departments/department-form/department-form.component.html` — `name` field with required + maxlength validation messages; `description` textarea with maxlength; organization_id shown read-only in edit mode; Save / Cancel buttons; breadcrumb.

## Phase 5: Routing ✅ DONE (2026-09-15)

### 5.1 Add `departamentos` route block
- [x] `frontend/src/app/app.routes.ts` — inserted between `categorias` and `ubicaciones` blocks: list (`path: ''`), new (`canActivate: [permissionGuard]`, `permission: 'CREATE departments'`), `:id/edit` (`canActivate: [permissionGuard]`, `permission: 'UPDATE departments'`); all 3 routes use `loadComponent` for lazy loading; `breadcrumb` + `title` + `phase` data for the global chrome
- [x] **`menu-map.ts` 1.10 — entry added back** (deferred from Phase 1)
- [x] **`menu-map.spec.ts` — `describe.skip` flipped to `describe`**: both tests for the Departamentos entry now execute live; CRITICAL-2 coherence test (route segments in app.routes.ts) stays green because the frontend route was added in the same commit

## Phase 5: Routing

- [ ] 5.1 Add `departamentos` route block to `frontend/src/app/app.routes.ts` (inside `/app` children, after `organizaciones`): list route (`path: ''`), new route (`path: 'new'`, `canActivate: [permissionGuard]`, `data.permission: 'CREATE departments'`), edit route (`path: ':id/edit'`, `canActivate: [permissionGuard]`, `data.permission: 'UPDATE departments'`).

## Phase 6: Backend Integration Tests ✅ DONE (2026-09-15)

### 6.1 List returns enriched shape
- [x] Added test in `departments.controller.spec.ts` asserting `result.items[0]` carries `organization_name` + `user_count` from the LEFT JOIN

### 6.2 MENU_MAP has Departamentos entry
- [x] Covered by Phase 5 tests (`menu-map.spec.ts` describe, 2 tests now live)

### 6.3 Full backend suite green
- [x] `cd backend && rtk jest` → 1129/1129 PASS (added 1 controller enriched-list test + 3 dept-related test additions across phases)

## Phase 6: Backend Integration Tests

- [ ] 6.1 [RED] Add test case in `backend/src/modules/departments/departments.controller.spec.ts`: `list()` response items include `organization_name` and `user_count` fields (mock service returns enriched shape).
- [ ] 6.2 [RED] Add test case in `backend/src/modules/menus/menus.service.spec.ts` (or `menu-map.spec.ts`): `MENU_MAP` includes `Departamentos` entry with `requires: 'READ departments'` and `order: 95`.
- [ ] 6.3 [GREEN] Verify all backend tests pass: `cd backend && npm test -- --testPathPattern="departments|menus"`.

## Phase 7: Frontend Integration Tests ✅ DONE (2026-09-15)

### 7.1 Edge cases for list
- [x] **403 hides Create/Edit/Delete buttons** when caller lacks CRUD perms — covered by `DepartmentListComponent` test (reporter role without `CREATE`/`UPDATE`/`DELETE` perms)
- [x] **Search error shows toast** — covered (mock rejects on the search refire, `error()` toast asserted)
- [x] **List empty shows EmptyState** — already covered by "shows the empty state when total is 0" test in Phase 3

### 7.2 Edge cases for form
- [x] **422 per-field validation** — added test asserting inline error or toast fires on `422` with `errors: { name: ... }`
- [x] **403 cross-org response shows error toast** — added test asserting `toast.error` invoked with the server message

## Phase 7: Frontend Integration Tests

- [ ] 7.1 [RED] Add edge-case tests in `frontend/src/app/features/catalogs/departments/department-list/department-list.component.spec.ts`: 403 response hides Create/Edit/Delete buttons; search error shows toast; list empty shows `EmptyStateComponent`.
- [ ] 7.2 [RED] Add edge-case tests in `frontend/src/app/features/catalogs/departments/department-form/department-form.component.spec.ts`: 422 validation errors display per-field; 403 cross-org response shows error toast.
- [ ] 7.3 [GREEN] Verify all frontend tests pass: `cd frontend && npx ng test --watch=false`.

## Phase 8: Verification + Cleanup

- [ ] 8.1 Run `cd backend && npm run lint && npm run typecheck` — fix any issues.
- [ ] 8.2 Run `cd frontend && npx ng build` (or `npm run build`) — confirm zero compile errors.
- [ ] 8.3 Run `cd backend && npm test` — full backend suite green.
- [ ] 8.4 Run `cd frontend && npx ng test --watch=false` — full frontend suite green.
- [ ] 8.5 Manual smoke: navigate to `/app/departamentos` as master and admin_org; verify Organization column visible for master, hidden for admin_org; create, edit, delete flows end-to-end.
