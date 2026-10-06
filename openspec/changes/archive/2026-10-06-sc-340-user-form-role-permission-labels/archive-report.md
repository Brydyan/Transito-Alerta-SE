# Archive Report: 2026-09-27-sc-340-user-form-role-permission-labels

**Status**: ✅ **ARCHIVED** — SDD cycle complete  
**Change Name**: `front/2026-09-27-sc-340-user-form-role-permission-labels`  
**Date Archived**: 2026-10-06  
**Archive Location**: `openspec/changes/archive/2026-10-06-sc-340-user-form-role-permission-labels/`  

---

## Executive Summary

The User Form Role & Permission Labels enhancement (`sc-340`) has been completely specified, implemented, verified, and archived. This change addresses four core usability and contract defects across user management forms in both backend and frontend:

1. **Soft-deleted roles excluded from dropdown** (RC1 / R1): `GET /api/users/form-data` now applies TypeORM `deletedAt: IsNull()` query filtering across both system admin and non-system admin branches, ensuring parity with `GET /api/roles`.
2. **Permission labels displayed as readable text instead of raw UUIDs** (RC2 / R2): Role permissions post-migration `0051_roles_permissions_uuid_format.sql` are resolved from catalog lookups into `"{action} {resource}"` in `UsersService.getRolePermissions` and `loadRolePermissions`, with explicit fallback (`'permiso no encontrado'`) for missing catalog items.
3. **Permission catalog projection corrected** (RC3 / R3): Fixed `getPermissionsCatalog` to map `id`, `resource`, `action` from actual backend entities rather than non-existent `p.accion` / `p.recurso`, eliminating `undefined undefined` strings.
4. **Wire contract alignment and null-safe filtering** (RC4 / R4, R5): `PermissionItem` interface and services tolerate both flat arrays (`PermissionEntity[]`) and enveloped responses; `filteredAllPerms` in `user-form.component.ts` handles nullable names with safe fallbacks (`(p.nombre ?? '').toLowerCase()`), preventing runtime `TypeError` crashes during search.
5. **Contract and fixture alignment** (R6): Modernized stale fixtures in `roles.component.spec.ts` to reflect post-0040 canonical role names (`master`, `operador_sistema`, `admin_org`, `operador_org`, `reporter`) and post-0051 UUID identifiers.

**Verification Status**: ✅ **PASS WITH WARNINGS** per QA Verification Audit ([`verify-report.md`](file:///home/andy/Escritorio/PROYECTOS/TASE/Transito-Alerta-SE/openspec/changes/front/2026-09-27-sc-340-user-form-role-permission-labels/verify-report.md), Engram Observation #1162).
- **Requirements Compliance**: 6/6 requirements (R1–R6) verified and 100% compliant.
- **Scenarios Compliance**: 11/11 test scenarios verified and passing (incorporating Amendment A-1).
- **Design Decisions**: 7/7 architectural design decisions (D1–D7) validated in production code.
- **Task Execution**: 21/21 implementation tasks completed across all 7 phases.
- **CI Gates in Scope**: Backend form-data unit tests 6/6 PASS; full backend unit suite 123/123 PASS (1275 tests); backend lint/typecheck/build exit code 0; frontend `admin/users` 8/8 suites PASS (75 tests); frontend production build exit code 0.
- **Zero Critical Issues**: No blockers or regressions within the change scope. Warnings are strictly confined to concurrent external branch typing issues (`tsc -b` in department/map specs) and Jest Zone.js concurrency contention.

---

## SDD Artifact Lineage

### Engram Observations

| Observation ID | Topic Key | Type | Title | Description |
|---|---|---|---|---|
| #1162 | `sdd/2026-09-27-sc-340-user-form-role-permission-labels/verify-report` | discovery | SDD Verify: 2026-09-27-sc-340-user-form-role-permission-labels PASS WITH WARNINGS | QA audit report certifying 6/6 requirements, 11/11 scenarios, and green scoped CI gates |
| #1163 | `sdd/2026-09-27-sc-340-user-form-role-permission-labels/archive-report` | architecture | SDD Archive: 2026-09-27-sc-340-user-form-role-permission-labels | Lifecycle closure report, spec sync, and archive registration |

### File Artifacts (OpenSpec)

| Artifact | Source Path | Target Canonical / Archive Path | Status |
|---|---|---|---|
| Proposal | `openspec/changes/front/2026-09-27-sc-340-user-form-role-permission-labels/proposal.md` | `openspec/changes/archive/2026-10-06-sc-340-user-form-role-permission-labels/proposal.md` | ✅ Archived |
| Delta Spec | `openspec/changes/front/2026-09-27-sc-340-user-form-role-permission-labels/specs/admin-user-form-role-permission-labels.spec.md` | `openspec/specs/admin-user-form-role-permission-labels/spec.md` | ✅ Synced to Canonical |
| Design | `openspec/changes/front/2026-09-27-sc-340-user-form-role-permission-labels/design.md` | `openspec/changes/archive/2026-10-06-sc-340-user-form-role-permission-labels/design.md` | ✅ Archived |
| Tasks | `openspec/changes/front/2026-09-27-sc-340-user-form-role-permission-labels/tasks.md` | `openspec/changes/archive/2026-10-06-sc-340-user-form-role-permission-labels/tasks.md` | ✅ Archived (21/21 complete) |
| Apply Progress | `openspec/changes/front/2026-09-27-sc-340-user-form-role-permission-labels/apply-progress.md` | `openspec/changes/archive/2026-10-06-sc-340-user-form-role-permission-labels/apply-progress.md` | ✅ Archived |
| Fixes Required | `openspec/changes/front/2026-09-27-sc-340-user-form-role-permission-labels/fixes-required.md` | `openspec/changes/archive/2026-10-06-sc-340-user-form-role-permission-labels/fixes-required.md` | ✅ Archived |
| Verify Report | `openspec/changes/front/2026-09-27-sc-340-user-form-role-permission-labels/verify-report.md` | `openspec/changes/archive/2026-10-06-sc-340-user-form-role-permission-labels/verify-report.md` | ✅ Archived (Verdict: PASS WITH WARNINGS) |
| Archive Report | `openspec/changes/front/2026-09-27-sc-340-user-form-role-permission-labels/archive-report.md` | `openspec/changes/archive/2026-10-06-sc-340-user-form-role-permission-labels/archive-report.md` | ✅ Generated |

---

## Specifications Synced

### Canonical Domain Created
- **Domain**: `admin-user-form-role-permission-labels`
- **Canonical Spec Path**: [`openspec/specs/admin-user-form-role-permission-labels/spec.md`](file:///home/andy/Escritorio/PROYECTOS/TASE/Transito-Alerta-SE/openspec/specs/admin-user-form-role-permission-labels/spec.md)
- **Scenarios Synced**: 11 scenarios across 6 requirements (including Amendment A-1)
- **Status**: Canonical specification created as the authoritative source of truth.

### Compliance Matrix

| Req | Scenario | Condition / Contract | Observed Implementation | Verification Evidence | Status |
|---|---|---|---|---|:---:|
| **R1** | **Sc. 1** | Soft-deleted legacy role excluded from dropdown | `GET /api/users/form-data` excludes `deleted_at IS NOT NULL` | `users.service.ts:78-80`, `deletedAt: IsNull()` | `users.service.form-data.spec.ts:166-175` | ✅ PASS |
| **R1** | **Sc. 2** | Filter symmetry between form-data & roles endpoints | `users.service.getFormData` matches `roles.service.findAll` filtering | Both endpoints enforce `deletedAt: IsNull()` | `users.service.form-data.spec.ts:177-189` | ✅ PASS |
| **R2** | **Sc. 3** | Role permissions post-0051 render readable labels | Views render `"ACTION resource"` instead of raw UUIDs | `UsersService.getRolePermissions` resolves via catalog | `users.service.spec.ts:111-130`, `new-user-form.component.spec.ts:231-250` | ✅ PASS |
| **R2** | **Sc. 4** | Edit mode renders matching readable labels | `user-form.component.html:274` renders resolved strings | `loadRolePermissions` resolves via `resolveRolePermissionLabels` | `users.service.spec.ts:206-220`, `user-form.component.ts:255-268` | ✅ PASS |
| **R2** | **Sc. 5** | Missing UUID catalog lookup falls back gracefully | Displays explicit fallback `'permiso no encontrado'` without error | `UNKNOWN_PERMISSION_LABEL` constant in `user.interface.ts:89` | `users.service.spec.ts:222-241`, `new-user-form.component.spec.ts:251-260` | ✅ PASS |
| **R3** | **Sc. 6** | Permission catalog projection produces valid labels | `getPermissionsCatalog` maps `id`, `resource`, `action` without `undefined` | `permissionLabel` helper in `user.interface.ts` | `users.service.spec.ts:175-190` | ✅ PASS |
| **R4** | **Sc. 7** | Client tolerates flat array wire response | Tolerates both `PermissionEntity[]` and `{ data, meta }` envelopes | `Array.isArray(res) ? res : (res.data ?? [])` in `users.service.ts` | `users.service.spec.ts:260-296` | ✅ PASS |
| **R5** | **Sc. 8** | PermissionItem wire model alignment | `PermissionItem` populated with idempotent normalization; stable `trackBy` | `toPermissionItem` helper; `user-form.html:304` (`track perm.permisoId`) | `user-form.component.spec.ts:92-129` | ✅ PASS |
| **R5** | **Sc. 9** | Permission search input does not crash on typing | `filteredAllPerms` null-safe with guarded lowercase | `(p.nombre ?? '').toLowerCase()` in `user-form.component.ts:123-132` | `user-form.component.spec.ts:65-74` | ✅ PASS |
| **R5** | **Sc. 10** | Empty search results return `[]` without error | Empty search returns empty list cleanly | Filter cleanly yields `[]` with empty template state | `user-form.component.spec.ts:76-90` | ✅ PASS |
| **R6** | **Sc. 11** | Test fixtures updated to canonical contracts | `roles.component.spec.ts` fixtures updated to post-0040 and post-0051 UUIDs | Modernized roles fixture with canonical roles and UUIDs | `roles.component.spec.ts:1-60` (12/12 PASS) | ✅ PASS |

---

## Verification Audit & CI Gate Metrics

- **Backend Unit Tests (Change Scope)**: `npm test -- users.service.form-data` → 1 suite, 6/6 tests PASS (2.392 s).
- **Backend Full Unit Suite**: `npm test` → 123/123 suites PASS (1275 passed, 11 skipped) in 26.452 s.
- **Backend Quality Gates**:
  - `npm run lint` → 0 errors (18 warnings in unrelated e2e files).
  - `npm run typecheck` → Exit code 0 (`tsc --noEmit -p tsconfig.json`).
  - `npm run build` → Exit code 0 (`nest build`).
- **Frontend Domain Tests (Change Scope)**:
  - `users.service.spec.ts` → 14/14 tests PASS (0.697 s).
  - `user-form.component.spec.ts` → 35/35 tests PASS (1.666 s).
  - `new-user-form.component.spec.ts` → 32/32 tests PASS (1.245 s).
  - `roles.component.spec.ts` → 12/12 tests PASS (1.141 s).
  - Full `admin/users` module → 8/8 suites PASS, 75/75 tests PASS in 2.023 s.
- **Frontend Production Build**: `npm run build` (`ng build`) completed with Exit code 0 (bundle: 608.37 kB).
- **Git Integration**: Merged into `develop` via PR #101 (`carlos_fp/sc-340/fix-user-form-orphan-role-names-raw-uuids`, commit `95af5d2bb`).

---

## Architectural & Design Decisions (D1–D7)

1. **D1 — Soft-delete filter in Backend Service**: Corrected directly in `users.service.ts:getFormData` with TypeORM `deletedAt: IsNull()` without requiring additional migrations.
2. **D2 — Frontend Label Resolution Pattern**: Permission UUIDs are resolved to readable strings in Angular service layer replicating proven pattern from `roles.service.ts`.
3. **D3 — Wire Format Tolerance**: Implemented dual-format handler `Array.isArray(res) ? res : res.data ?? []` in `UsersService` to smoothly tolerate both flat array and enveloped responses.
4. **D4 — Scoped Boundaries for Role Stats**: Out-of-scope `roles.service.ts:getStats` module count fix tracked as dedicated backend Follow-up F1.
5. **D5 — Stale Fixture Correction**: Kept `roles.component.ts` intact and updated stale fixture in `roles.component.spec.ts` to reflect canonical contracts.
6. **D6 — User Permissions Breakdown DTO**: Hardcoded empty direct permissions in `getUserById` documented as external backend technical debt (Follow-up F2).
7. **D7 — Documentation Hygiene**: Cleaned up obsolete "F6 fix" comments across `user.interface.ts`, `users.service.ts`, and `user-form.component.ts`.

---

## Tracked Follow-ups

- **F1 (`back/roles-stats-modules-from-uuids`)**: Extend `roles.service.ts:getStats` in backend to parse module names from permission UUIDs instead of legacy string splitting.
- **F2 (`back/user-permissions-breakdown`)**: Extend `GET /api/users/:id` response DTO in backend to include direct permissions breakdown.
- **F3 (`front/replace-vacuous-subscribe-assertions`)**: Refactor legacy async tests in `users.service.spec.ts` that place expectations inside unawaited `.subscribe()` callbacks.
- **F4 (`front/permission-catalog-cache`)**: Optimize `UsersService.getRolePermissions` by caching permissions catalog (`shareReplay(1)` or signal) to eliminate redundant HTTP requests on role selection.

---

## SDD Cycle Complete

The change `front/2026-09-27-sc-340-user-form-role-permission-labels` has completed all lifecycle phases:
- **Proposal** ✅ Approved & Documented
- **Specs** ✅ Defined (11 scenarios) & Synced to Canonical `openspec/specs/admin-user-form-role-permission-labels/spec.md`
- **Design** ✅ Documented (Decisions D1–D7) & Validated
- **Tasks** ✅ Implemented & Tested (Phases 1–7, 21/21 tasks complete)
- **Verify** ✅ Verified PASS WITH WARNINGS (Observation #1162, zero critical issues)
- **Archive** ✅ Moved to `openspec/changes/archive/2026-10-06-sc-340-user-form-role-permission-labels/`
