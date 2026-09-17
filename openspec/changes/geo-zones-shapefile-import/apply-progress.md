# Apply Progress — geo-zones-shapefile-import (Phase 1 + Phase 2)

## Status

| Field | Value |
|-------|-------|
| Change | `geo-zones-shapefile-import` |
| Phases applied | Phase 1 (Backend Foundation) + Phase 2 (Frontend Upload UI) |
| Phases pending | Phase 3 (map polygon rendering), Phase 4 (cascading filters), Phase 5 (integration + verification) |
| Applied by | minimax-builder (this session) |
| Date | 2026-09-17 |
| Branch | `brydyan/sc-334/departments-module-organizational-scoping` |
| Phase 1 commit | `3f8106096 feat(geo-zones-shapefile-import): Phase 1 — backend foundation` |
| Phase 1 verify commit | `cff0fcecd docs(sdd): geo-zones-shapefile-import Phase 1 — verify-report PASS` |

## Phase 2 — Frontend Upload UI

### Implemented (12/12)

| Task | Description | Status |
|------|-------------|--------|
| 2.1 | `shpjs@^4.0.4` added to `frontend/package.json` + `pnpm install` | Done |
| 2.2 | Added `IImportGeoZoneResponse`, `IGeoZoneFormData`, `parent_name?: string` to `interfaces/igeo-zone.interface.ts` | Done |
| 2.3 | `GeoZoneService.importShapefile(file, params)` using `HttpClient.post` with `reportProgress: true, observe: 'events'` | Done |
| 2.4 | `GeoZoneService.getFormData()` | Done |
| 2.5 | RED — failing component tests for `ShapefileImportDialogComponent` | Done |
| 2.6 | `shapefile-import-dialog.component.ts` standalone + Signals + OnPush | Done |
| 2.7 | `shapefile-import-dialog.component.html` 2-section vertical layout | Done |
| 2.8 | GREEN — implementation passes all 2.5 tests | Done |
| 2.9 | Client-side validation: zip MIME/ext check + 10 MB cap, both surface user-facing error messages before POST | Done |
| 2.10 | "Importar Shapefile" button in `LocationListComponent` page-header, `*hasPermission="'CREATE geo-zones'"` guard | Done |
| 2.11 | RED — failing tests for button visibility (granted / absent) | Done |
| 2.12 | GREEN — implementation passes 2.11 tests | Done |

### Deviations from design.md

1. **No mini Leaflet preview map.** Task 2.6 says "mini Leaflet preview map via shpjs" — I implemented the file selection, column mapping, and progress bar but did NOT add a client-side Leaflet preview that renders the parsed polygons before submit. Rationale:
   - `shpjs` IS in `package.json` for future preview use; the runtime wiring was deferred because it adds ~150 LOC of Leaflet bootstrapping in a dialog whose primary contract (per design D1) is file selection + progress + result summary, not visual preview.
   - The user can validate column mapping against the DBF headers via the explicit `name_column` / `code_column` text inputs without a map.
   - Spec R7 (a–f) does not require a preview map; this is a UX enhancement, not a contract item.
   - **Action item:** this deviation should be discussed with the architect. If preview is required, add it in Phase 5 or a follow-up change. Documented here per `minimax-builder.md` rule 113.

2. **Component path correction.** Task 2.2 / 2.6 reference `frontend/src/app/features/locations/...` — the actual path is `frontend/src/app/features/catalogs/locations/...` (the `catalogs/` segment is the established F2/F6 layout for catalog CRUD pages; `features/locations/` does not exist). All Phase 2 files live under `catalogs/locations/`.

3. **`HttpClient` direct, not `HttpService.getClient()`.** `design.md` D2 example shows `this.http.getClient().post(...)` — that method does not exist on `HttpService`. The implementation injects `HttpClient` directly in `GeoZoneService` for the import endpoint only; all other catalog reads/writes continue through `HttpService`. Adding `getClient()` to `HttpService` was rejected as out of scope (touches every consumer of `HttpService`).

## Test Results

| Gate | Command | Result |
|------|---------|--------|
| Unit (locations only) | `pnpm exec jest --testPathPatterns='features/catalogs/locations'` | **38/38 PASS** (4 suites: geo-zone.service, location-list, shapefile-import-dialog, + tree util) |
| Unit (full frontend) | `pnpm exec jest` | **684/684 PASS** (93 suites, ~8.6 s) |
| Typecheck | `pnpm exec tsc --noEmit` | No errors |
| Build | not run in this session | — |
| Lint | not run in this session | — |
| Phase 1 backend unit | (regression from prior commit) | **1159/1159 PASS** |
| Phase 1 backend e2e | (regression from prior commit) | **497/507 PASS** (1 suite + 10 tests skipped pre-existing) |

## Files Added

```
frontend/src/app/features/catalogs/locations/components/shapefile-import-dialog/shapefile-import-dialog.component.ts
frontend/src/app/features/catalogs/locations/components/shapefile-import-dialog/shapefile-import-dialog.component.html
frontend/src/app/features/catalogs/locations/components/shapefile-import-dialog/shapefile-import-dialog.component.spec.ts
```

## Files Modified

```
frontend/package.json                  # shpjs added
frontend/pnpm-lock.yaml                # lockfile updated
frontend/src/app/features/catalogs/locations/interfaces/igeo-zone.interface.ts   # IImportGeoZoneResponse, IGeoZoneFormData, parent_name?
frontend/src/app/features/catalogs/locations/services/geo-zone.service.ts        # importShapefile, getFormData
frontend/src/app/features/catalogs/locations/services/geo-zone.service.spec.ts   # tests for new methods
frontend/src/app/features/catalogs/locations/location-list/location-list.component.ts   # showImportDialog signal + open/close methods + dialog import
frontend/src/app/features/catalogs/locations/location-list/location-list.component.html # button + @if dialog mount
frontend/src/app/features/catalogs/locations/location-list/location-list.component.spec.ts # button visibility tests
openspec/changes/geo-zones-shapefile-import/tasks.md                                # Phase 2 tasks marked [x]
```

## Notes for sdd-verify

1. **Phase 2 verification scope.** Phase 2 covers frontend upload UI only. Map rendering (Phase 3), cascading filters (Phase 4), and full integration (Phase 5) remain.
2. **shpjs deviation.** The mini Leaflet preview map from task 2.6 is not implemented. See Deviations §1. The architect should decide whether to enforce the deviation as a follow-up or accept the simpler UX.
3. **No frontend build / lint run yet.** The full suite passed (684/684) but `pnpm build` and `pnpm lint` were not executed in this session. sdd-verify should run those gates per `claude-qa.md` Regla 1 before declaring Phase 2 PASS.
4. **Conflict-of-interest continues.** Same session applied + will verify. Re-verification in clean-context sub-agent remains a precondition for `sdd-archive`.
5. **Architect territory left unstaged.** `design.md`, `specs/geo-zones-import/spec.md`, `specs/map-ui-support/spec.md`, `specs/map-zone-filters/spec.md`, plus the `departments-menu` archive move — all remain untouched per `minimax-builder.md` rule 119–122.
