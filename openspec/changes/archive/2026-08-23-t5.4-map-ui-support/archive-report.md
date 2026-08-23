# Archive Report: T5.4 Map UI Support

**Change**: t5.4-map-ui-support
**Archived**: 2026-08-23
**Status**: COMPLETE ✅
**Verify Verdict**: PASS (0 CRITICAL, 0 WARNING, 1 SUGGESTION)

---

## Change Summary

### Endpoints Implemented
1. **`GET /api/map/filters`** — Returns incident categories sorted alphabetically. JWT auth required.
2. **`GET /api/users/form-data`** — Returns roles and organizations for user management forms. Requires `READ users` permission.

### Scope
- New `MapModule` with `MapController` and `MapSupportService`
- Extended `UsersService` and `UsersController` with `getFormData` method
- New constants: `SYSTEM_ONLY_ROLES` tuple for role filtering
- 15 new/modified files (13 implementation, 2 test)
- 0 database migrations

### Port Source
- `GeoReporta/backend/app/Domains/Incidents/Http/MapFilterController.php`
- `GeoReporta/backend/app/Domains/Users/Http/UserController.php` (formData method)

---

## Specification Compliance

### R1 — Map Filters Endpoint

| Scenario | Status | Evidence |
|----------|--------|----------|
| Authenticated user receives categories sorted alphabetically | ✅ PASS | E2E test: `GET /api/map/filters returns categories sorted alphabetically` |
| Unauthenticated → 401 | ✅ PASS | E2E test: `GET /api/map/filters without auth returns 401` |
| Empty categories → empty array | ✅ PASS | Unit test: `returns empty array when no categories exist` |
| Response includes id and name fields only | ✅ PASS | E2E assertion: shape validation |

**Compliance: 4/4 scenarios**

### R2 — Users Form-Data Endpoint

| Scenario | Status | Evidence |
|----------|--------|----------|
| System admin receives all roles and all orgs | ✅ PASS | E2E test: `system admin sees all roles and all organizations, both lists sorted ASC by name` |
| Org-admin receives restricted roles and only their own org | ✅ PASS | E2E test: `org admin: system-only roles excluded, only own organization returned` |
| Caller without READ users permission → 403 | ✅ PASS | E2E test: `caller without READ users permission gets 403` |
| Unauthenticated → 401 | ✅ PASS | E2E test: `unauthenticated form-data request returns 401` |
| Roles and organizations sorted alphabetically | ✅ PASS | E2E test: ASC order assertions (lines 86-87, 109) |

**Compliance: 5/5 scenarios**

**Total: 9/9 spec scenarios compliant**

---

## Implementation Summary

### New Files (13)
1. `backend/src/modules/map/map.module.ts` — Module registration
2. `backend/src/modules/map/map-support.service.ts` — Map filters service
3. `backend/src/modules/map/map.controller.ts` — Map filters controller
4. `backend/src/modules/map/dto/category.dto.ts` — Category DTO
5. `backend/src/modules/map/dto/map-filters-response.dto.ts` — Response DTO
6. `backend/src/modules/map/map-support.service.spec.ts` — Unit tests (3 tests)
7. `backend/src/modules/users/dto/form-data-response.dto.ts` — FormData response DTO
8. `backend/src/modules/users/role-exclusions.constants.ts` — Constants (SYSTEM_ONLY_ROLES, SYSTEM_ADMIN_ROLE_NAME)
9. `backend/src/modules/users/users.service.form-data.spec.ts` — Unit tests for getFormData (4 tests)
10. `backend/test/e2e/map-ui-support.e2e-spec.ts` — E2E tests (6 scenarios)
11. `openspec/specs/map-ui-support/spec.md` — Main spec (synced from delta)

### Modified Files (2)
1. `backend/src/modules/users/users.service.ts` — Added `getFormData(currentUser)` method
2. `backend/src/modules/users/users.controller.ts` — Added `GET /users/form-data` route
3. `backend/src/modules/users/users.module.ts` — Added `OrganizationEntity` to forFeature
4. `backend/src/app.module.ts` — Added `MapModule` import

---

## Test Results

| Test Suite | Count | Status | Duration |
|-----------|-------|--------|----------|
| Unit Tests (Total) | 734 | ✅ PASS | 12.075 s |
| Map Support Service | 3 | ✅ PASS | (included above) |
| Users Service Form-Data | 4 | ✅ PASS | (included above) |
| E2E Tests (Total) | 152 | ✅ PASS | 261.706 s |
| Map UI Support E2E | 6 | ✅ PASS | 14.373 s |

**Coverage**: Not collected (threshold not configured in openspec/config.yaml).

---

## Key Design Decisions

### D1: MapModule Imports TypeOrmModule Directly
**Decision**: `MapModule` imports `TypeOrmModule.forFeature([IncidentCategoryEntity])` instead of importing `IncidentCategoriesModule`.
**Rationale**: Avoids pulling in the full module's permission-gated controller and service. Single repository registration is cleaner and prevents coupling to sibling modules.

### D2: No Organization Scoping on Map Filters
**Decision**: `GET /api/map/filters` returns global incident categories with no org filtering.
**Rationale**: `incident_categories` is a global catalog in the NestJS schema. Mirrors GeoReporta's legacy behavior.

### D3: getFormData as UsersService Method (Not New Service)
**Decision**: `getFormData` is an additive method on `UsersService` rather than a new service.
**Rationale**: Single responsibility maintained — form-data is user-management support, owned by `UsersService`. Method is small enough to not justify a new class.

### D4: SYSTEM_ONLY_ROLES as Const Tuple
**Decision**: Role exclusion uses a constant array `['admin_sistema', 'operador_sistema', 'admin_legacy']`.
**Rationale**: Mirrors GeoReporta's exclusion list. String constants avoid coupling to an enum.

### D5: No Redis Caching
**Decision**: No caching implemented for reference data endpoints.
**Rationale**: Reference data is small (< 50 rows) and rarely changes. DB query per request is negligible. Caching adds invalidation complexity for no measurable gain.

---

## Known Deviations

### Deviation 1: Separate Test File for getFormData
**What**: Unit tests for `getFormData` in separate file `users.service.form-data.spec.ts`.
**Why**: Original `users.service.spec.ts` mocks `avatarStorage`, `authService`, `sessionsRepository` (not relevant to `getFormData`). Separate test module is cleaner and faster.

### Deviation 2: Sort Verified End-to-End, Not In-Memory
**What**: Unit tests verify query asks for `order: { name: 'ASC' }` but don't assert sort in memory. Sort verification is in E2E tests.
**Why**: Sort is a database responsibility. E2E tests confirm end-to-end with real data (W1 fix: migration-resistant comparisons).

### Deviation 3: MapModule Does Not Import IncidentCategoriesModule
**What**: Design D1 implemented: direct TypeOrmModule import instead of full module import.
**Why**: Follows cleaner module scoping and avoids unnecessary coupling.

---

## Verification Report

**Verdict**: **PASS**

- 0 CRITICAL issues
- 0 WARNING issues
- 1 SUGGESTION (optional enhancement)
  - S1: Add `expect(roleNames).not.toContain('admin_legacy')` to e2e org-admin scenario for explicit coverage (currently verified via unit tests)

All 9 specification scenarios are compliant. All tests pass (80 suites / 734 unit, 17 suites / 152 e2e).
W1 fix confirmed: sort proven end-to-end with migration-resistant assertions.

---

## SDD Artifact Traceability

**Delta Spec**: `openspec/changes/t5.4-map-ui-support/specs/map-ui-support/spec.md`
**Main Spec**: `openspec/specs/map-ui-support/spec.md` (created 2026-08-23)

**Artifacts Archived**:
- proposal.md (115 lines)
- design.md (145 lines)
- tasks.md (97 lines)
- apply-progress.md (118 lines)
- verify-report.md (166 lines)
- specs/map-ui-support/spec.md (125 lines)

---

## Post-Archive Checklist

- [x] Main spec created at `openspec/specs/map-ui-support/spec.md`
- [x] Change folder moved to `openspec/changes/archive/2026-08-23-t5.4-map-ui-support/`
- [x] Archive contains all artifacts (proposal, design, tasks, apply-progress, verify-report, spec)
- [x] Active changes directory no longer contains t5.4-map-ui-support
- [x] Verify report recorded with 0 CRITICAL issues
- [x] Implementation verified against specification (9/9 scenarios pass)
- [x] All tests green (80+3+4 unit; 17 e2e)
- [x] No database migrations
- [x] No breaking changes to existing modules

---

## SDD Cycle Complete

The T5.4 Map UI Support change has been:
1. **Proposed**: Lightweight reference endpoints for map UI
2. **Specified**: 2 endpoints, 9 behavioral scenarios, RFC 2119 keywords
3. **Designed**: Architecture decisions (D1-D5), module scoping, SQL queries
4. **Tasked**: 10 phases, 19 tasks (all marked complete)
5. **Implemented**: 13 new files, 3 modified, 13 new/modified tests
6. **Verified**: PASS verdict, 0 CRITICAL, all scenarios compliant
7. **Archived**: Change folder to archive, main spec synced, audit trail established

**Next Steps**: None — change is complete and closed.
