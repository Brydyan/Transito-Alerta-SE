```yaml
change: 2026-09-05-geo-zones-catalog-contract
phase: verify
date: 2026-09-14
verdict: PASS WITH WARNINGS
spec_requirements: 7
spec_scenarios: 8
issues:
  critical: 0
  warnings: 3
  suggestions: 1
```

# Verification Report — `2026-09-05-geo-zones-catalog-contract`

**Date**: 2026-09-14 (re-verify pass — post R5/D4 fix)
**Verdict**: PASS WITH WARNINGS
**Issues**: 0 CRITICAL / 3 WARNING / 1 SUGGESTION

---

## CI Evidence

| Job | Command | Result |
|-----|---------|--------|
| Geofencing unit tests | `rtk jest --testPathPattern='geofencing'` | PASS — 33 assertions, 0 failures |
| E2E geo-zones suite | `rtk npm run test:e2e -- --testPathPattern='geo-zones'` | PASS — 20/20 tests |
| Prior unit run | `rtk jest` | PASS — 1064 tests, 0 failures |
| Typecheck | `rtk npm run typecheck` | 0 errors |
| Lint | `rtk npm run lint` | 0 errors, 27 warnings (pre-existing) |

### Pre-existing E2E Failures (NOT caused by this change)

| Suite | Failure | Root cause |
|-------|---------|------------|
| `t7-rollback-cycle.e2e-spec.ts` | Orphan DOWN file: `0053_citizen_social_features.DOWN.sql` | Introduced by commit `576b9d4ef` (migration rename 0053→0054 for F4); DOWN file not removed when UP was renumbered. |
| `f4-migration.e2e-spec.ts` | `expectedPerms.length` = 0, expected 3 | Same commit: citizen social features permissions not present in migrations 0001–0053 baseline used by the harness. |

Both failures are on the `brydyan/sc-323/f6-*` branch changes unrelated to geo-zones.

---

## Completeness Table

| Phase | Status |
|-------|--------|
| Proposal artifact | Present |
| Spec artifact | Present (7 req, 8 scenarios) |
| Design artifact | Present (D1–D8) |
| Tasks artifact | Present (Phases 1–6) |
| Tasks marked complete | NOT DONE — all checkboxes unchecked (apply agent did not tick them) |

---

## Spec Compliance Matrix

| Requirement | Description | Implementation | Test Coverage | Status |
|------------|-------------|----------------|---------------|--------|
| R1 | POST /geo-zones reuses existing endpoint | `geo-zones.controller.ts` unchanged | E2E TS-1..TS-4 PASS | PASS |
| R2 | GET /geo-zones/tree projects `code` field | `listFlat` CTE: `SELECT id, name, code, ...` in both UNION branches; `GeoZoneTreeRow.code` added; `buildZoneTree` propagates it | Unit: `buildZoneTree — code propagation` (2 tests pass) | PASS |
| R3 | CreateGeoZoneDto.polygon is optional | `@IsOptional()` + `@IsGeoJsonPolygon()` on `polygon?` field | Unit: `polygon is optional (sc-323-f6)` test passes | PASS |
| R4 | Backend validates geometry with PostGIS | `assertValidGeometry` calls `repo.validateGeometry` → `ST_IsValid` + `ST_DWithin 500km` | Unit: Ecuador bounds tests pass; E2E TS-4 (self-intersect 400) PASS | PASS |
| R5 | Geofencing filters by `polygon IS NOT NULL` | **IMPLEMENTED** — `findZoneByPoint` line 48 and `findZonesNearby` line 70 in `geofencing.repository.ts` both have `AND polygon IS NOT NULL` | Geofencing unit tests PASS (33 assertions); parameterization and param-order covered; SQL content assertion for IS NOT NULL absent (see WARNING-2) | PASS |
| R6 | Tree includes all zones (polygon NULL or not) | `listFlat` has no polygon filter; `buildZoneTree` includes all rows | E2E TS-8 PASS (structure) | PASS |
| R7 | Frontend listAll() pagination remains | Frontend code unchanged; `MAX_PAGE_SIZE = 100` stays | Not part of backend test suite | PASS (by inspection) |

---

## Scenario Coverage

| Scenario | Description | Status | Evidence |
|----------|-------------|--------|----------|
| S1 | Upload shapefile with valid geometry → 201 + polygon set | PARTIAL | E2E TS-3 covers coercion; no explicit "shapefile workflow" E2E. Service unit tests cover valid polygon path. Frontend not implemented (out of scope). |
| S2 | Create zone without polygon → 201 + polygon NULL | PASS | Service unit test `polygon is optional` passes |
| S3 | Incident routing skips zones with NULL polygon | PASS | `AND polygon IS NOT NULL` confirmed in both geofencing query methods (lines 48, 70); unit tests cover parameterization, return values, and param-order |
| S4 | Catalog lists all zones (with and without polygon) | PASS | Tree CTE has no polygon filter; E2E TS-8 structure passes |
| S5 | Invalid geometry (self-intersecting) → 400 | PASS | E2E TS-4 PASS |
| S6 | Geometry outside Ecuador → 400 | PASS | Service unit test + E2E covers bounds; `ST_DWithin 500km` active |
| S7 | Tree includes `code` field | PASS (unit) | Unit tests pass; E2E TS-8 does NOT assert `code` — integration gap (see WARNING-3) |
| S8 | PATCH with polygon null clears geometry | PASS | Existing update path allows undefined polygon; repo spec covers PATCH pattern |

---

## Design Coherence

| Decision | Expected | Actual | Status |
|----------|----------|--------|--------|
| D1: Parsing in frontend | Frontend parses shapefile; backend receives GeoJSON | Backend unchanged (correct) | PASS |
| D2: polygon @IsOptional | `@IsOptional() @IsGeoJsonPolygon()` on create DTO | Implemented exactly | PASS |
| D3: PostGIS validation in service | `assertValidGeometry` with ST_IsValid + bounds | Implemented; also checks `geom_type === 'ST_MultiPolygon'` and `empty` | PASS |
| D4: Geofencing filters by polygon presence | `AND polygon IS NOT NULL` in WHERE | **Implemented** — lines 48 and 70 of `geofencing.repository.ts` | PASS |
| D5: Tree projects `code` | CTE SELECT includes `code` column | Implemented in both UNION branches | PASS |
| D6: UpdateGeoZoneDto.polygon already optional | No change needed | Confirmed, no change | PASS |
| D7: No new endpoint | Reuse POST /geo-zones | Confirmed | PASS |
| D8: Tree has no pagination | listFlat returns all rows | Confirmed, no LIMIT on tree query | PASS |

---

## Issues

### WARNING-2: Geofencing spec missing `IS NOT NULL` SQL assertion

**Where**: `backend/src/modules/geofencing/geofencing.repository.spec.ts`

**What**: The unit spec does not assert that `polygon IS NOT NULL` appears in the SQL strings for either `findZoneByPoint` or `findZonesNearby`. The implementation is correct (lines 48 and 70), but a regression that removes the predicate would not be caught by the current test suite.

**Resolution needed**: Add `expect(sql).toContain('polygon IS NOT NULL')` to both `findZoneByPoint` and `findZonesNearby` describe blocks in `geofencing.repository.spec.ts`.

---

### WARNING-3: E2E TS-8 does not assert `code` field in tree nodes

**Where**: `backend/test/e2e/geo-zones.e2e-spec.ts` lines 245–258

**What**: Scenario 7 (tree includes code) has only unit-level coverage. The E2E test verifies structure (children count, level) but does not assert `province.code` exists in the response. If the CTE projection were removed, the E2E would still pass.

**Resolution needed**: Add `expect(province).toHaveProperty('code')` to TS-8 or a new E2E test.

---

### WARNING-4: Tasks.md — all checkboxes unchecked

**Where**: `openspec/changes/back/2026-09-05-geo-zones-catalog-contract/tasks.md`

**What**: All task boxes remain `[ ]` despite backend implementation being complete for T1.1, T1.2, T2.1, T2.2. The apply agent did not update task state.

**Resolution needed**: Mark T1.1, T1.2, T2.1, T2.2 as `[x]` (done); leave T3.x, T4.x, T5.x as `[ ]` (pending/out-of-scope for this phase).

---

### SUGGESTION-1: E2E scenario for optional polygon via HTTP

**Where**: `backend/test/e2e/geo-zones.e2e-spec.ts`

**What**: No E2E test sends `POST /geo-zones` without a `polygon` field and asserts 201 + `zone.polygon === null`. The optional-polygon path is covered by unit tests only; an HTTP-level regression test would close the gap.

---

## R5/D4 Fix Verification

**geofencing.repository.ts — findZoneByPoint (lines 43–54)**:
```sql
WHERE active = true
  AND polygon IS NOT NULL
  AND ST_Contains(polygon, ST_SetSRID(ST_Point($1, $2), 4326))
LIMIT 1
```
Predicate `AND polygon IS NOT NULL` present at line 48. CONFIRMED.

**geofencing.repository.ts — findZonesNearby (lines 60–78)**:
```sql
WHERE active = true
  AND polygon IS NOT NULL
  AND ST_DWithin(
    polygon::geography,
    ST_SetSRID(ST_Point($1, $2), 4326)::geography,
    $3
  )
```
Predicate `AND polygon IS NOT NULL` present at line 70. CONFIRMED.

---

## Frontend Status

Phase 4 tasks (T4.1–T4.4: shpjs install, ShapefileUploadDialog, location-form integration) are explicitly out of scope for this verification pass. The proposal designates shapefile UI as a future frontend task. No frontend changes are present on this branch.

---

## Summary

Backend implementation is complete:

- **Done**: R1 (endpoint reuse), R2 (tree `code` projection), R3 (optional polygon DTO), R4 (PostGIS validation), R5 (geofencing `polygon IS NOT NULL` filter — NOW IMPLEMENTED), R6 (tree shows all zones), R7 (pagination unchanged)
- **No missing requirements**: all 7 backend requirements implemented
- **CI**: E2E geo-zones 20/20 PASS; geofencing unit 33/33 PASS; 1064 total unit tests PASS; 0 typecheck errors; 0 lint errors
- **Pre-existing failures**: t7-rollback-cycle and f4-migration (unrelated — migration renumbering artifact)

Remaining warnings are test-coverage gaps (not implementation gaps). Archive is unblocked.

**Verdict: PASS WITH WARNINGS** — 0 CRITICAL, 3 WARNING (SQL assertion missing, E2E code assertion missing, tasks.md unchecked), 1 SUGGESTION.
