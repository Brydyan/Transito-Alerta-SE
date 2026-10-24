# Verify Report — 2026-10-14-sc-446-user-geo-zone-assignment

**Verdict:** PASS WITH WARNINGS
**Date:** 2026-10-14
**Auditor:** Claude (QA Lead / Architect — dual role; conflict declared)
**Issues:** 0 CRITICAL · 1 WARNING · 1 SUGGESTION

---

## Test Evidence

| Gate | Command | Exit | Result |
|------|---------|------|--------|
| Backend tests | `cd backend && rtk jest --testPathPattern="users.service\|admin-create-user.dto" --no-coverage` | 0 | 56 PASS / 0 FAIL |
| Frontend tests | `cd frontend && npx jest --testPathPatterns="new-user-form" --no-coverage` | 0 | 57 PASS / 0 FAIL (2 suites) |
| Backend typecheck | `cd backend && rtk npm run typecheck` | 0 | ok |
| Frontend build | `cd frontend && rtk npm run build` | 0 | Bundle complete (5.166s) — 2 pre-existing NG8113 warnings unrelated to this change |

---

## Spec Compliance Matrix

Specs: `specs/admin-user-creation-form/spec.md` + `specs/admin-user-creation-form-backend/spec.md`
Requirements: 4 (2 MODIFIED + 2 ADDED) · Scenarios: 14 · All: PASS

### Backend (7 scenarios)

| Scenario | Test | Status |
|----------|------|--------|
| valid UUID accepted + persisted | dto.spec + service.spec | PASS |
| null accepted | `@IsOptional` + `?? null` branch | PASS |
| absent defaults to null | dto.spec + service.spec | PASS |
| non-UUID rejected | dto.spec | PASS |
| other fields unaffected | whitelist unchanged | PASS |
| user created with geo_zone_id | service.spec pass-through | PASS |
| user created without geo_zone_id | service.spec null branch | PASS |

### Frontend (7 scenarios)

| Scenario | Test | Status |
|----------|------|--------|
| dropdown loads on form open | component.spec G1 | PASS |
| admin selects a geo zone | component.spec G3 | PASS |
| admin leaves unselected | component.spec G5 | PASS |
| geo zone list fails to load | error handler — dropdown stays empty, form not blocked | PASS |
| Zona / Sector Operativo stays disabled | pre-existing test | PASS |
| payload includes geo_zone_id when selected | component.spec G4 | PASS |
| payload nulls geo_zone_id when not selected | component.spec G5 | PASS |

---

## "Regla a Medias" Check — CLEAN

| Path | Location | Present |
|------|----------|---------|
| Entity `@Column` | `user.entity.ts:143` | YES |
| DTO `@IsOptional @IsUUID` | `admin-create-user.dto.ts:55-57` | YES |
| Service `geoZoneId: dto.geo_zone_id ?? null` | `users.service.ts:383` | YES |
| `NewUserFormData.geoZoneId` | `user.interface.ts:311` | YES |
| `CreateUserJsonPayload.geo_zone_id` | `user.interface.ts:378` | YES |
| `DEFAULT_NEW_USER_FORM.geoZoneId: null` | `user.interface.ts:329` | YES |
| Component signal `geoZones` | `new-user-form.component.ts:79` | YES |
| `getFormData()` call + `.parents` assign | `new-user-form.component.ts:193-201` | YES |
| `onGeoZoneChange()` handler | `new-user-form.component.ts:268-270` | YES |
| Submit payload `geo_zone_id: d.geoZoneId` | `new-user-form.component.ts:344` | YES |
| Template select `[disabled]/@for/[value]/(change)` | `new-user-form.component.html:314-321` | YES |
| Migration section 7 + DOWN rollback | `0022_t7_schema_completeness.sql` + DOWN | YES |

---

## Issues

### W1 — WARNING: `geoZoneId` absent from `isFormDirty`

**File:** `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.ts:143-155`

`isFormDirty` checks `organizationId`, `departmentId`, and `roleId` but omits `geoZoneId`. If an operator selects only a geo zone and clicks Cancel, the discard confirmation dialog is skipped silently.

Non-blocking for archive. One-line fix.

### S1 — SUGGESTION: Silent GeoZoneService failure

**File:** `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.ts:198-200`

`getFormData()` failure is swallowed silently. Dropdown stays disabled via `[disabled]="geoZones().length === 0"` but no message explains the empty state. Spec scenario says warning "MAY be shown" — implementation chose not to. Valid per design; suggestion for a future iteration.

---

## Deviations from Design

| Deviation | Impact | Acceptable |
|-----------|--------|------------|
| `geoZones` signal typed as `IGeoZoneFormData['parents'][number]` (inline indexed) instead of named alias | Equivalent, no runtime impact | YES |

---

## Manual Smokes (pending running environment)

- 5.4 — Create user with geo zone selected → verify DB row
- 5.5 — Create user without geo zone → verify `geo_zone_id IS NULL`
- 5.6 — Verify canton dropdown populates on form open

---

## Next Step

Fix W1 (`isFormDirty`), then proceed to `sdd-archive`.
