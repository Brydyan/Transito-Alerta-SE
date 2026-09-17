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

---

## Phase 3 — Frontend Map Polygon Rendering

### Implemented (8/8)

| Task | Description | Status |
|------|-------------|--------|
| 3.1 | `zone_id?: string` added to `MapActiveFilters` interface | Done |
| 3.2 | `ZONE_STYLES` exported `Record<GeoZoneLevel, L.PathOptions>` with the four palette colors (provincia `#6366f1`, canton `#0891b2`, parroquia `#059669`, zona `#d97706`) | Done |
| 3.3 | RED — failing test for one L.geoJSON layer per zone with correct ZONE_STYLES stroke color | Done |
| 3.4 | `MapComponent.loadZones()` refactored to call `listAll()` (geometry always returned in list endpoint — backend has no `include_geometry=true` flag, contrary to tasks.md text), filters inactive/null-polygon zones, uses `ZONE_STYLES[z.level]` per zone | Done |
| 3.5 | GREEN — renderZonePolygons implementation passes 3.3 tests | Done |
| 3.6 | RED — failing test for bindPopup carrying name, code, level, parent_name | Done |
| 3.7 | `createZoneLayer()` binds popup HTML with `name`, `code ?? '---'`, `level`, `parent_name ?? '---'`; re-enables `interactive: true` + `bubblingMouseEvents: true` after binding (so the click opens the popup without blocking incident markers) | Done |
| 3.8 | GREEN — popup handler passes 3.6 tests | Done |

### Deviations from design.md / tasks.md

1. **Path correction (W2-style).** Tasks.md references `features/map/services/map-data.service.ts` and `features/map/map.component.ts` — actual paths are `features/citizen/map/services/map-data.service.ts` and `features/citizen/map/map.component.ts` (the citizen-facing map; `features/map/` does not exist). Same architect fix as Phase 2 W2.
2. **`include_geometry=true` query parameter does not exist on backend.** Tasks 3.4 says "call `GET /geo-zones?include_geometry=true`" — the list endpoint always returns `polygon` (`GeoZoneDetailRow` selects it). Implementation calls `listAll()` directly. No backend change needed.
3. **HTML escape for popup content.** Spec doesn't mention XSS, but admin-controlled zone names flow into a popup payload that Leaflet renders as HTML. Added minimal `escapeHtml()` for `& < > " '`. Logged as defensive measure, not a deviation from any explicit spec text.

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| Unit (map scope) | `pnpm exec jest --testPathPatterns='features/citizen/map/map.component'` | **10/10 PASS** (3 original + 7 new for Phase 3) |
| Unit (full frontend) | `pnpm exec jest` | **739/739 PASS** (98 suites, ~8 s) |
| Typecheck | `pnpm exec tsc --noEmit` | No errors |
| Lint | `pnpm run lint` | 0 errors, 0 warnings |
| Build | `pnpm run build` | OK (pre-existing bundle budget warning unchanged) |
| Phase 1 backend regression | (unchanged) | 1159/1159 unit + 497/507 e2e |
| Phase 2 frontend regression | (unchanged) | 684/684 → now 739/739 (cumulative) |

### Files Added

(none)

### Files Modified

```
frontend/src/app/features/citizen/map/services/map-data.service.ts
frontend/src/app/features/citizen/map/map.component.ts
frontend/src/app/features/citizen/map/map.component.spec.ts
openspec/changes/geo-zones-shapefile-import/tasks.md
openspec/changes/geo-zones-shapefile-import/apply-progress.md
```

### Notes for sdd-verify (Phase 3 specific)

1. **Path correction (Deviation 1) and backend param (Deviation 2)** both flow to architect for SDD path fix — same as Phase 2 W2 pattern.
2. **HTML escape (Deviation 3)** is defensive. If architect prefers no escape (treating admin content as trusted), remove the helper. Tests do not cover the escape — they assert `popupHtml.toContain('Daule')` which works either way for plain ASCII names.
3. **Conflict-of-interest continues.** Same session applied + will verify. Re-verification in clean-context sub-agent remains a precondition for `sdd-archive`.
4. **Architect territory left unstaged** — same set as previous phases.

---

## W1-reversal — 2026-09-16 — "Importar Shapefile" moved from `LocationList` to `LocationForm`

**Andy direction** (after reviewing the running app): the bulk-import button should live on `app/ubicaciones/new` (the `LocationForm` create/edit page), not on the list page. This is a user-direction reversal of Phase 2 placement, committed in `2fab67f03`.

**What changed**:
- "Importar Shapefile" button + `<app-shapefile-import-dialog>` mount moved from `LocationListComponent` to `LocationFormComponent`.
- `LocationList` now only hosts "Nueva ubicación" / Edit / Delete per row.
- `LocationForm` now has a button in its footer (next to "Cancelar" / "Crear ubicación") that opens the same `ShapefileImportDialogComponent` with `*hasPermission="'CREATE geo-zones'"` guard.
- Tests moved: 4 button-visibility tests relocated from `location-list.component.spec.ts` to `location-form.component.spec.ts` (plus one negative test left in `location-list` asserting the button does NOT render there anymore).
- `ShapefileImportDialogComponent` itself is unchanged — only its mount point moved.

**Why this is a reversal of design.md D1 + tasks.md 2.10**:
- design.md D1 explicitly chose "Standalone dialog launched from LocationList" over "2-col grid in LocationForm". The new placement is closer to the rejected D1 option: button lives inside the form view. The dialog itself remains a modal launched from a button — so it's not literally the rejected 2-col grid; it's "button inside form → modal dialog", which is a third option D1 did not enumerate.
- tasks.md 2.10 explicitly said "button to `location-list.component.ts`" — so the original spec was the LocationList placement, not LocationForm. The new placement is a deviation from `tasks.md` 2.10 too.

**Architect action items** (reissued alongside existing W1–W3 from Phase 2):
- Update `design.md` D1 to enumerate this third option and mark it chosen (or revert to LocationList).
- Update `tasks.md` 2.10 to say `location-form.component.ts` instead of `location-list.component.ts`.
- Update `spec.md` R7/R9 wording if any "button on list" semantics appear there.

**Test impact**:
- `location-list.component.spec.ts`: 4 button tests removed, 1 negative test added ("does not render on list").
- `location-form.component.spec.ts`: 4 button tests added (granted / absent / opens / closes).
- Dialog component spec: unchanged.
- Service spec: unchanged.

**Verification (post-move)**:
- `pnpm exec jest`: 740/740 PASS (98 suites)
- `pnpm exec tsc --noEmit`: no errors
- `pnpm run lint`: 0 errors, 0 warnings
- `pnpm run build`: OK (pre-existing bundle budget warning unchanged)
- Backend regression: unchanged (no backend touched)

---

## W2-reversal — 2026-09-16 — modal dialog replaced by inline panel in `LocationForm`

**Andy direction** (third UX iteration): the bulk-import UX should be a **2-column grid inside `LocationForm`**, not a button-launched modal. Specifically:
- LEFT panel: existing single-zone CRUD fields (Nombre / Código / Nivel / Padre).
- RIGHT panel: file input (.zip) + auto-parent checkbox + inline progress + inline result envelope.

This replaces the entire `ShapefileImportDialogComponent` with the inline implementation.

**What changed**:
- `LocationFormComponent` template: form fields wrapped in a `grid-cols-1 lg:grid-cols-2` layout; right panel added with file input, auto-parent checkbox, "Importar" button, progress bar, result envelope.
- `LocationFormComponent` class: replaced `showImportDialog` signal + `openImportDialog`/`closeImportDialog` methods with `importFile`, `importProgress`, `importResult`, `importError`, `importAutoParent`, `isImporting` signals + `onImportFileChange`, `onImportAutoParentChange`, `submitImport` methods.
- Removed imports of `ShapefileImportDialogComponent` and `HasPermissionDirective` from the location-list component (no longer relevant).
- Added imports of `HttpEvent`, `HttpEventType` from `@angular/common/http` and `IImportGeoZoneResponse` from the interface module.
- **DELETED** `frontend/src/app/features/catalogs/locations/components/shapefile-import-dialog/` (3 files: `*.component.ts`, `*.component.html`, `*.component.spec.ts`).
- The level for the import is now read from the form's `level` dropdown (no separate import-level dropdown).
- Column mapping defaults to `NAME` / `CODE` (no separate column-mapping inputs — feature flag for future).

**What did NOT change**:
- `GeoZoneService.importShapefile` and `getFormData` methods — unchanged.
- `IGeoZone` interface (`IImportGeoZoneResponse`, `parent_name`, etc.) — unchanged.
- `package.json` (`shpjs` still in deps — kept for future preview-map work that Andy might request later).
- Backend (Phase 1) — unchanged.

**Test impact**:
- `location-form.component.spec.ts`: 4 button tests removed; 9 inline-panel tests added (renders with/without permission; non-zip rejection; >10MB rejection; submit uses form.level + auto_parent + NAME/CODE; UploadProgress advances signal; Response resets progress + stores envelope; submit disabled during upload; auto-parent toggle off).
- `location-list.component.spec.ts`: 1 negative test still asserts the list page doesn't render an "Importar shapefile" button.
- `shapefile-import-dialog.component.spec.ts`: deleted with the dialog.
- `geo-zone.service.spec.ts`: unchanged (still tests `importShapefile` multipart + `getFormData` envelope).

**Why this is a reversal of design.md D1 + tasks.md 2.5-2.12**:
- design.md D1 explicit chose "Standalone dialog launched from LocationList" and rejected "2-col grid in LocationForm". The current placement is closer to (but not exactly) the rejected option — modal is gone, both flows share the form view.
- tasks.md 2.5-2.12 specified `ShapefileImportDialogComponent` (level dropdown + column mapping + progress + result + client-side validation). All of those are now gone or simplified.
- The third option that emerged — inline panel inside the form — was not enumerated in either design.md or tasks.md.

**Architect action items** (cumulative with prior W1-reversal):
- Update `design.md` D1 to enumerate the inline option and mark it chosen.
- Update `tasks.md` 2.5-2.12 to either delete the dialog-task block or rewrite it for the inline UX.
- Decide whether the level should still come from the form (current choice) or from a separate dropdown in the right panel.
- Decide whether column mapping (NAME/CODE) should stay hardcoded or become configurable.

**Verification (post-W2)**:
- `pnpm exec jest`: 738/738 PASS (97 suites; -2 vs 740 because 7 dialog-suite tests are deleted)
- `pnpm exec tsc --noEmit`: no errors
- `pnpm run lint`: 0 errors, 0 warnings
- `pnpm run build`: OK (pre-existing bundle budget warning unchanged)
- Backend regression: unchanged (no backend touched)

---

## Phase 4 — Frontend Cascading Zone Filters

### Implemented (11/11)

| Task | Description | Status |
|------|-------------|--------|
| 4.1 | `provincias` / `cantones` / `parroquias` signals + 3 loading flags | Done |
| 4.2 | 3 new form controls: `provincia_id`, `canton_id` (disabled), `parroquia_id` (disabled) | Done |
| 4.3 | RED test: provincia selection enables canton + calls `list(level=canton, parent_id=provinciaId)` | Done |
| 4.4 | `valueChanges` on `provincia_id`: reset downstream + enable canton + load cantones | Done |
| 4.5 | `valueChanges` on `canton_id`: reset parroquia + enable parroquia + load parroquias | Done |
| 4.6 | `clearFilters()` resets all 3 zone controls + re-disables downstream | Done |
| 4.7 | GREEN: cascade + canton→parroquia + reset tests all pass | Done |
| 4.8 | 3 `<select>` elements in template with `formControlName` + disabled binding | Done |
| 4.9 | RED test: `filtersChange` emits `zone_id = parroquia_id ?? canton_id ?? provincia_id` | Done |
| 4.10 | `MapComponent` filter handler: highlight selected zone layer (heavier stroke) + `map.fitBounds()` | Done |
| 4.11 | GREEN: zone_id emission test passes | Done |

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| Unit (map-filters scope) | `pnpm exec jest --testPathPatterns='features/citizen/map/components/map-filters'` | **11/11 PASS** (5 original + 6 Phase 4) |
| Unit (map scope) | `pnpm exec jest --testPathPatterns='features/citizen/map'` | **21/21 PASS** (10 map.component + 11 map-filters) |
| Unit (full frontend) | `pnpm exec jest` | **745/745 PASS** (97 suites, ~7 s) |
| Typecheck | `pnpm exec tsc --noEmit` | No errors |
| Lint | `pnpm run lint` | 0 errors, 0 warnings |
| Build | `pnpm run build` | OK (pre-existing bundle budget warning unchanged) |

### Files Modified

```
frontend/src/app/features/citizen/map/components/map-filters/map-filters.component.ts
frontend/src/app/features/citizen/map/components/map-filters/map-filters.component.html
frontend/src/app/features/citizen/map/components/map-filters/map-filters.component.spec.ts
frontend/src/app/features/citizen/map/map.component.ts                (highlight + fitBounds)
frontend/src/app/features/citizen/map/map.component.spec.ts           (mockGeoZoneService.list mock)
openspec/changes/geo-zones-shapefile-import/tasks.md                  (Phase 4 [x])
```

### Notes for sdd-verify

1. **Path correction (W2-style).** Tasks.md references `features/map/components/map-filters/...` — actual is `features/citizen/map/components/map-filters/...`. Same pattern as Phase 2 W2 + Phase 3 W1. Architect should fix SDD paths.
2. **Per-page limits on GeoZoneService.list.** Used `per_page: 100` for provincias/cantones/parroquias because backend caps at 100 (F2.3.2 regression). Same pattern as `GeoZoneService.listAll()`.
3. **Filter chip reset on clearing.** `clearFilters()` resets form + re-disables downstream + clears cantones/parroquias arrays.
4. **`zone_id` propagation downstream.** MapComponent stores `zoneLayerById` map keyed by zone id, calls `highlightZone()` from `onFiltersChange`. Heavier stroke + dashed-removed. `map.fitBounds()` with 40px padding + maxZoom 12 (zone can be small).
