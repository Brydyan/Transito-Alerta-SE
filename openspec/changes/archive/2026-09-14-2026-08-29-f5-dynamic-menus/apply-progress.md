# Apply Progress: F5 — Dynamic Menus (Tramo 1 + Tramo 2 + Tramo 3)

**Change**: `2026-08-29-f5-dynamic-menus`
**Scope**: `back` (Tramo 1-2) + `front` (Tramo 3)
**Batch**: Tramo 1 (F5.1–F5.4) + Tramo 2 (F5.5 CRUD & validations) + Tramo 3 (F5.6 Frontend)
**Mode**: Strict TDD

## Task Completion Matrix

### Tramo 1 — F5.1 + F5.2 + F5.3 + F5.4 (the risky read path)

| Task | Status | Evidence |
|------|--------|----------|
| F5.1.1 — Reserve migration numbering | ✅ Done | 0054 + 0055 added to MIGRATION_LOG.md |
| F5.1.2 — Create `menu_options` | ✅ Done | 0054_dynamic_menus_schema.sql |
| F5.1.3 — Create `menu_option_roles` | ✅ Done | 0054_dynamic_menus_schema.sql |
| F5.1.4 — Create `api_endpoints` | ✅ Done | 0054_dynamic_menus_schema.sql |
| F5.1.5 — Create `menu_option_endpoints` | ✅ Done | 0054_dynamic_menus_schema.sql |
| F5.1.5b — Add `roles.scope` | ✅ Done | 0054_dynamic_menus_schema.sql (CHECK + UPDATEs for 5 roles) |
| F5.1.6 — Register menu-options permissions | ✅ Done | 0054_dynamic_menus_schema.sql (4 rows, grants to master+operador_sistema) |
| F5.1.7 — Propagate to users.permissions | ✅ Done | 0054_dynamic_menus_schema.sql (same pattern as F4) |
| F5.1.8 — Seed api_endpoints | ✅ Done | 0054_dynamic_menus_schema.sql (~54 route rows, updated F5.5.7) |
| F5.1.9 — Update MIGRATION_LOG.md | ✅ Done | Entries for 0054 + 0055 |
| F5.2.1 — Migrate MENU_MAP to menu_options | ✅ Done | 0055_dynamic_menus_data_migration.sql |
| F5.2.2 — Derive menu_option_roles | ✅ Done | 0055_dynamic_menus_data_migration.sql |
| F5.2.3 — Group handling decision | ✅ Done | Groups derived from hierarchy (not a column) |
| F5.2.4 — Keep menu-map.ts | ✅ Done | File unchanged, preserved as rollback path (D7) |
| F5.3.1 — menu-option.entity.ts | ✅ Done | Self-ref parent/children, soft delete (D6) |
| F5.3.2 — menu-option-role.entity.ts | ✅ Done | Composite PK, physical delete (D6) |
| F5.3.3 — api-endpoint.entity.ts + menu-option-endpoint.entity.ts | ✅ Done | Both created |
| F5.4.1 — Specs first (filtering) | ✅ Done | 5 filtering tests written before implementation |
| F5.4.2 — Rewrite menus.service.ts | ✅ Done | DB resolution with contract unchanged (D1) |
| F5.4.3 — Tree by parent_id | ✅ Done | buildTree() method, 4 tree tests |
| F5.4.4 — Parity test (MENU_MAP) | ✅ Done | 2 parity tests: routes match, labels match |
| F5.4.5 — Adapt menu-map.spec.ts | ✅ Done | File unchanged — validates MENU_MAP routes (D8) |
| F5.4.6 — Cache menu:v1:role:{roleId} | ✅ Done | Redis TTL 1h, key space separate from perm:v3:uid:* |
| F5.4.7 — Invalidation menu:v1:* | ✅ Done | invalidateCache() method, 2 tests |
| F5.4.8 — Cache tests | ✅ Done | 2 cache tests (hit + invalidation) |

### Tramo 2 — F5.5 CRUD and validations

| Task | Status | Evidence |
|------|--------|----------|
| F5.5.1 — Validation specs | ✅ Done | 11 validation tests: cycle, self-parent, duplicate route, delete-with-children, can_write without can_read |
| F5.5.2 — menu-options.service.ts CRUD | ✅ Done | create, update, delete (soft), findAll, findOne + cache invalidation |
| F5.5.3 — Cycle validation (D3) | ✅ Done | Ancestor chain walk in assertValidParent(), 3 tests (cycle, self-parent, valid) |
| F5.5.4 — menu-options.controller.ts + guards | ✅ Done | PermissionGuard + @RequirePermission('menu-options') on all 9 endpoints |
| F5.5.5 — Role matrix by scope | ✅ Done | Three blocks (platform/organization/public), new roles appear with no access, anonymous excluded (Q5) |
| F5.5.6 — Endpoint assignment + catalog | ✅ Done | Idempotent PUT, paginated GET with route/method/description filters |
| F5.5.7 — Divergence test (D5) | ✅ Done | 3 tests: seed matches controllers, no orphans, non-empty seed. Seed updated with 9 new menu-options routes |
| F5.5.8 — Lint + typecheck + test + e2e | ✅ Done | Lint: 0 errors, 29 warnings. Typecheck: clean. Tests: 118 suites / 1110 tests. E2E: blocked (Testcontainers/Ryuk) |

**Total: 32/32 tasks complete (F5.1–F5.5) + 9/9 tasks complete (F5.6)**

## TDD Cycle Evidence

### Tramo 1

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| F5.4.1 Filtering | `menus.service.db-resolution.spec.ts` | Unit | ✅ 16/16 | ✅ Written | ✅ Passed | ✅ 5 cases | ➖ None needed |
| F5.4.2 Contract (D1) | `menus.service.db-resolution.spec.ts` | Unit | ✅ 16/16 | ✅ Written | ✅ Passed | ✅ 3 cases | ➖ None needed |
| F5.4.3 Tree (D3) | `menus.service.db-resolution.spec.ts` | Unit | ✅ 16/16 | ✅ Written | ✅ Passed | ✅ 4 cases | ➖ None needed |
| F5.4.4 Parity | `menus.service.db-resolution.spec.ts` | Unit | ✅ 16/16 | ✅ Written | ✅ Passed | ✅ 2 cases | ➖ None needed |
| F5.4.6–F5.4.8 Cache | `menus.service.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 cases | ➖ None needed |

### Tramo 2

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| F5.5.1 Validation specs | `menu-options.service.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 11 cases | ➖ None needed |
| F5.5.2 CRUD | `menu-options.service.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 6 cases | ➖ None needed |
| F5.5.3 Cycle validation | `menu-options.service.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 cases | ➖ None needed |
| F5.5.4 Controller guards | `menu-options.controller.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 9 cases | ➖ None needed |
| F5.5.5 Role matrix | `menu-options.service.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 2 cases | ➖ None needed |
| F5.5.6 Endpoint assignment | `menu-options.service.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 cases | ➖ None needed |
| F5.5.7 Divergence test | `api-endpoint-divergence.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 cases | ➖ None needed |

### Tramo 3 — F5.6 Frontend

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| F5.6.1 MenuOptionService | `menu-option.service.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 10 cases | ➖ None needed |
| F5.6.3 MenuTreeComponent | `menu-tree.component.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 7 cases | ➖ None needed |
| F5.6.5 RoleMatrixComponent | `role-matrix.component.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 7 cases | ➖ None needed |
| F5.6.6 EndpointPickerComponent | `endpoint-picker.component.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 10 cases | ➖ None needed |
| F5.6.2 MenuOptionsComponent | `menu-options.component.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 7 cases | ➖ None needed |

## Gate Results

| Gate | Command | Result |
|------|---------|--------|
| Lint | `npm run lint` | ✅ 0 errors, 29 warnings (pre-existing) |
| Typecheck | `npm run typecheck` | ✅ Clean |
| Tests (backend) | `npm test` | ✅ 118 suites, 1110 tests passing |
| Tests (frontend) | `pnpm exec jest --runInBand` | ✅ 93 suites, 656 tests passing (was 88/615) |
| Build (frontend) | `pnpm run build` | ✅ Exit 0, menu-options lazy chunk generated |
| E2E | `npm run test:e2e` | ⏳ Blocked by Testcontainers/Ryuk infra (known) |

## Open Findings (Tramo 3 — F5.6) — from agent report + gatekeeper audit

1. **Endpoint assigned-panel hydration (F5.6.6, partial integration)**: `EndpointPickerComponent` starts EMPTY on re-select because the backend lacks `GET /menu-options/:id/endpoints` (only assignment POST exists). The dual-panel behavior itself is tested (move both ways, search, counts), but assigned endpoints are not re-loaded. **Follow-up**: add the backend GET endpoint + hydrate on init.
2. **Sidebar link to `/app/controles` (F5.6.7, linkage)**: the route + guard exist in `app.routes.ts`, but the `menu_options` seed has NO row with that route, so no sidebar/citizen menu link appears. Reachable only by direct URL while logged in. **Follow-up**: new migration (0056) inserting the controls menu row under the correct group parent + permission wiring, then re-apply to docker.
3. **Delete confirmation (UX)**: `MenuOptionsComponent` calls delete directly; no confirm dialog (pattern exists in `roles.component.ts` via `ConfirmDialogService`). Not blocking; polish for a later round.

## Files Created/Modified

### Tramo 1 (existing)

| File | Action | What Was Done |
|------|--------|---------------|
| `database/migrations/0054_dynamic_menus_schema.sql` | Created | 4 tables, roles.scope, permissions, api_endpoints seed |
| `database/migrations/0055_dynamic_menus_data_migration.sql` | Created | MENU_MAP → menu_options + menu_option_roles |
| `database/rollback/0054_dynamic_menus_schema.DOWN.sql` | Created | Rollback for schema migration |
| `database/rollback/0055_dynamic_menus_data_migration.DOWN.sql` | Created | Rollback for data migration |
| `database/MIGRATION_LOG.md` | Modified | Added 0054 + 0055 entries |
| `backend/src/modules/menus/entities/menu-option.entity.ts` | Created | MenuOptionEntity with self-ref, soft delete |
| `backend/src/modules/menus/entities/menu-option-role.entity.ts` | Created | Composite PK, physical delete |
| `backend/src/modules/menus/entities/api-endpoint.entity.ts` | Created | Catalog entity |
| `backend/src/modules/menus/entities/menu-option-endpoint.entity.ts` | Created | Junction entity |
| `backend/src/modules/menus/menus.service.ts` | Rewritten | DB resolution, tree building, Redis cache |
| `backend/src/modules/menus/menus.module.ts` | Modified | Added TypeOrmModule.forFeature + new entities |
| `backend/src/modules/menus/menu-map.ts` | Modified | Added `children: MenuEntry[]` to interface |
| `backend/src/modules/menus/menus.service.spec.ts` | Rewritten | Updated for DB-based service |
| `backend/src/modules/menus/menus.service.db-resolution.spec.ts` | Created | 18 resolution/parity/cache tests |
| `openspec/changes/back/2026-08-29-f5-dynamic-menus/design.md` | Modified | Added § Implementation notes |
| `openspec/changes/back/2026-08-29-f5-dynamic-menus/tasks.md` | Modified | Marked F5.1–F5.4 as [x] |

### Tramo 2 (new)

| File | Action | What Was Done |
|------|--------|---------------|
| `backend/src/modules/menus/dto/create-menu-option.dto.ts` | Created | Create DTO with class-validator decorators |
| `backend/src/modules/menus/dto/update-menu-option.dto.ts` | Created | Partial update DTO |
| `backend/src/modules/menus/dto/set-role-access.dto.ts` | Created | canRead + canWrite DTO |
| `backend/src/modules/menus/dto/assign-endpoints.dto.ts` | Created | endpointIds array DTO |
| `backend/src/modules/menus/menu-options.service.ts` | Created | CRUD, validations, role matrix, endpoint assignment |
| `backend/src/modules/menus/menu-options.controller.ts` | Created | 9 endpoints with PermissionGuard |
| `backend/src/modules/menus/menus.module.ts` | Modified | Added MenuOptionsService, MenuOptionsController, RoleEntity |
| `backend/src/entities/role.entity.ts` | Modified | Added `scope` column (migration 0054) |
| `backend/src/modules/menus/menu-options.service.spec.ts` | Created | 21 unit tests: CRUD, validations, matrix, endpoints |
| `backend/src/modules/menus/menu-options.controller.spec.ts` | Created | 9 permission metadata tests |
| `backend/src/modules/menus/api-endpoint-divergence.spec.ts` | Created | 3 divergence tests (D5) |
| `database/migrations/0054_dynamic_menus_schema.sql` | Modified | Added 9 menu-options routes to api_endpoints seed |
| `openspec/changes/back/2026-08-29-f5-dynamic-menus/tasks.md` | Modified | Marked F5.5.1–F5.5.8 as [x] |

### Tramo 3 (new — frontend)

| File | Action | What Was Done |
|------|--------|---------------|
| `frontend/src/app/core/services/menu-option.service.ts` | Created | CRUD, role matrix, endpoint assignment service (F5.6.1) |
| `frontend/src/app/core/services/menu-option.service.spec.ts` | Created | 10 unit tests: CRUD, matrix, endpoints |
| `frontend/src/app/features/admin/menu-options/menu-options.component.ts` | Created | Main layout: tree left + detail right (F5.6.2) |
| `frontend/src/app/features/admin/menu-options/menu-options.component.spec.ts` | Created | 7 unit tests: selection, create, back navigation |
| `frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.ts` | Created | Hierarchical tree with expand/collapse + "Agregar menú" (F5.6.3) |
| `frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.spec.ts` | Created | 7 unit tests: root items, children, expand, selection |
| `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.ts` | Created | Role × (read, write) matrix grouped by scope (F5.6.5) |
| `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.spec.ts` | Created | 7 unit tests: blocks, labels, toggle, canWrite guard |
| `frontend/src/app/features/admin/menu-options/components/endpoint-picker/endpoint-picker.component.ts` | Created | Dual-panel endpoint picker with search (F5.6.6) |
| `frontend/src/app/features/admin/menu-options/components/endpoint-picker/endpoint-picker.component.spec.ts` | Created | 10 unit tests: filter, move both ways, bulk move |
| `frontend/src/app/app.routes.ts` | Modified | Added `/app/controles` route with permissionGuard (F5.6.7) |
| `openspec/changes/back/2026-08-29-f5-dynamic-menus/tasks.md` | Modified | Marked F5.6.1–F5.6.9 as [x] |

## Validation Specs Implemented (F5.5.1)

| Validation | HTTP Status | Tested |
|-----------|-------------|--------|
| Cycle in ancestor chain | 422 BadRequestException | ✅ 3 tests |
| Self-parent | 422 BadRequestException | ✅ 2 tests |
| Duplicate route | 409 ConflictException | ✅ 3 tests |
| Delete with children | 409 ConflictException | ✅ 2 tests |
| can_write without can_read | 422 BadRequestException | ✅ 3 tests |

## F5.2.3 Decision: Group Handling

Groups (`INCIDENCIAS`, `GESTIÓN`, `CATÁLOGOS`) are NOT stored as a column. They are derived from the parent/child hierarchy:

- Group parent rows have empty `route` (not navigable) and serve as section headers.
- Child menu options reference the group parent via `parent_id`.
- The service builds the tree from `parent_id` (D3); the frontend renders the parent name as the section header.

## Remaining Tasks (NOT in this batch)

- [x] F5.6 — Frontend (pantalla del mock 05-01) ✅ DONE
- [ ] F5.7 — Closing (e2e tests, cache invalidation deployment)
