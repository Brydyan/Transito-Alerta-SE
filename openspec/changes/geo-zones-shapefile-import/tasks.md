# Tasks: Geo-Zones Shapefile Bulk Import + Map Zone Filters

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900–1 200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Backend Foundation) → PR 2 (Frontend Upload UI) → PR 3 (Frontend Map + Filters) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend Foundation: DTOs, repository methods, service, controller, backend tests | PR 1 | `cd backend && npm test -- --testPathPattern=geo-zones` | `cd backend && npm run test:e2e -- --testPathPattern=geo-zones` | Remove `POST /import`, `GET /form-data`, DTOs, repo methods; no migration needed |
| 2 | Frontend Upload UI: ShapefileImportDialog + GeoZoneService methods + form component tests | PR 2 | `cd frontend && npm test -- --testPathPattern=shapefile-import` | N/A — browser upload flow; covered by component tests | Delete `shapefile-import-dialog/` folder; revert `location-list` button + `geo-zone.service.ts` additions |
| 3 | Frontend Map + Filters: zone polygon rendering, cascading dropdowns, map filter wiring, map/filter tests | PR 3 | `cd frontend && npm test -- --testPathPattern="map.component\|map-filters"` | Manual smoke: upload fixture zip → verify polygons + colors + cascading | Revert `MapComponent`, `MapFiltersComponent`, `map-data.service.ts`, `map-filters.component.html` additions |

---

## Phase 1: Backend Foundation

- [x] 1.1 Add `shpjs` and `@types/shpjs` to `backend/package.json`; run `npm install` in `backend/`
- [x] 1.2 Create `backend/src/modules/geo-zones/dto/import-geo-zone-query.dto.ts` with `ImportGeoZoneQueryDto` (`level`, `auto_parent`, `name_column`, `code_column`) and class-validator decorators
- [x] 1.3 Create `backend/src/modules/geo-zones/dto/import-geo-zone-response.dto.ts` with `ImportGeoZoneResponse` interface (`imported`, `skipped`, `errors[]`, `warnings[]`)
- [x] 1.4 **RED** — Write failing unit test for `ImportGeoZoneQueryDto` validation rules in `backend/src/modules/geo-zones/dto/import-geo-zone-query.dto.spec.ts`
- [x] 1.5 **GREEN** — Implement `ImportGeoZoneQueryDto` class-validator rules so 1.4 passes
- [x] 1.6 Add `createInTransaction(queryRunner, input)` to `backend/src/modules/geo-zones/geo-zones.repository.ts`; converts GeoJSON to `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(...), 4326))`
- [x] 1.7 Add `findByCode(code: string)` to `backend/src/modules/geo-zones/geo-zones.repository.ts`
- [x] 1.8 Add `findParentBySpatialContainment(geometry)` to `backend/src/modules/geo-zones/geo-zones.repository.ts` using `ST_Contains`
- [x] 1.9 Add `getFormData()` to `backend/src/modules/geo-zones/geo-zones.repository.ts`: `SELECT id, name, code, level FROM geo_zones WHERE active = true ORDER BY level, name`
- [x] 1.10 Add `parent_name` to `findAll()` via `LEFT JOIN geo_zones p ON g.parent_id = p.id` selecting `p.name AS parent_name` in `backend/src/modules/geo-zones/geo-zones.repository.ts`
- [x] 1.11 **RED** — Write failing unit tests for `GeoZonesRepository` new methods in `backend/src/modules/geo-zones/geo-zones.repository.spec.ts` (mock QueryRunner, mock data source)
- [x] 1.12 **GREEN** — Implement repository methods so 1.11 passes
- [x] 1.13 Add `importShapefile(buffer, query)` to `backend/src/modules/geo-zones/geo-zones.service.ts`: shpjs parse → per-feature validation pipeline (D7) → transactional batch insert → `purgeGeoCaches()`
- [x] 1.14 Add `getFormData()` to `backend/src/modules/geo-zones/geo-zones.service.ts` delegating to repo
- [x] 1.15 **RED** — Write failing unit tests for `GeoZonesService.importShapefile()` in `backend/src/modules/geo-zones/geo-zones.service.spec.ts`: valid batch, per-feature invalid geometry, duplicate code skip, empty-name rejection, out-of-bounds rejection, DB error full rollback
- [x] 1.16 **GREEN** — Implement service methods so 1.15 passes
- [x] 1.17 Add `POST /geo-zones/import` to `backend/src/modules/geo-zones/geo-zones.controller.ts` before `:id` route: `@FileInterceptor('file', { limits: { fileSize: 10_485_760 } })`, `@RequirePermission('CREATE')`, `@HttpCode(200)`
- [x] 1.18 Add `GET /geo-zones/form-data` to `backend/src/modules/geo-zones/geo-zones.controller.ts` before `:id` route: `@RequirePermission('READ')`, delegates to `getFormData()`
- [x] 1.19 **RED** — Write failing integration tests in `backend/test/e2e/geo-zones-import.e2e-spec.ts` (Testcontainers + real DB): (a) valid 3-feature zip → 200 + envelope, (b) per-feature invalid geometry → partial import + errors array, (c) duplicate code → skipped count, (d) 11 MB zip → 400, (e) unauthenticated → 401, (f) no permission → 403
- [x] 1.20 **GREEN** — Wire controller + service + repo so all integration tests in 1.19 pass

---

## Phase 2: Frontend Upload UI

> Prerequisite: Phase 1 merged (PR 1) or available on base branch.

- [ ] 2.1 Add `shpjs` to `frontend/package.json`; run `pnpm install` in `frontend/`
- [ ] 2.2 Add `IImportGeoZoneResponse`, `IFormData` interfaces and `parent_name?: string` field to `frontend/src/app/features/locations/interfaces/igeo-zone.interface.ts`
- [ ] 2.3 Add `importShapefile(file, params)` method to `frontend/src/app/features/locations/services/geo-zone.service.ts` using `HttpClient.post` with `{ reportProgress: true, observe: 'events' }`
- [ ] 2.4 Add `getFormData()` method to `frontend/src/app/features/locations/services/geo-zone.service.ts`
- [ ] 2.5 **RED** — Write failing component tests for `ShapefileImportDialogComponent` in `frontend/src/app/features/locations/components/shapefile-import-dialog/shapefile-import-dialog.component.spec.ts`: (a) file type `.zip` accepted, (b) file > 10 MB rejected with error message, (c) `UploadProgress` event advances progress signal to 50, (d) 200 response resets progress and shows summary
- [ ] 2.6 Create `frontend/src/app/features/locations/components/shapefile-import-dialog/shapefile-import-dialog.component.ts` with: `<input type="file" accept=".zip">`, `level` dropdown, column mapping dropdowns (name_column/code_column auto-detected from DBF headers), mini Leaflet preview map via shpjs, progress bar signal (0–100), submit calls `GeoZoneService.importShapefile()`
- [ ] 2.7 Create `frontend/src/app/features/locations/components/shapefile-import-dialog/shapefile-import-dialog.component.html` (2-section layout: file + mapping top, preview + progress bottom)
- [ ] 2.8 **GREEN** — Complete dialog implementation so 2.5 tests pass
- [ ] 2.9 Add client-side validation to dialog: reject non-zip by MIME/extension before POST; reject file > 10 485 760 bytes before POST; show user-facing error message for each case
- [ ] 2.10 Add "Importar Shapefile" button to `frontend/src/app/features/locations/location-list/location-list.component.ts` and `.html`; opens `ShapefileImportDialogComponent`; guard: visible only to users with `CREATE geo-zones` permission
- [ ] 2.11 **RED** — Write failing tests for `LocationListComponent` button visibility: (a) `CREATE geo-zones` granted → button renders, (b) permission absent → button absent
- [ ] 2.12 **GREEN** — Implement permission guard on location-list button so 2.11 passes

---

## Phase 3: Frontend Map — Zone Polygon Rendering

> Prerequisite: Phase 1 (PR 1) complete; Phase 2 (PR 2) may run in parallel.

- [ ] 3.1 Add `zone_id?: string` to `MapActiveFilters` interface in `frontend/src/app/features/map/services/map-data.service.ts`
- [ ] 3.2 Add `ZONE_STYLES` constant to `frontend/src/app/features/map/map.component.ts`: `Record<GeoZoneLevel, L.PathOptions>` with colors per design (provincia `#6366f1`, canton `#0891b2`, parroquia `#059669`, zona `#d97706`)
- [ ] 3.3 **RED** — Write failing map component test: given zones array with one feature per level, `renderZonePolygons()` creates four `L.geoJSON` layers each using the correct stroke color from `ZONE_STYLES`
- [ ] 3.4 Extend `MapComponent.loadZones()` in `frontend/src/app/features/map/map.component.ts` to call `GET /geo-zones?include_geometry=true`; store result; render each zone with `L.geoJSON` using `ZONE_STYLES[z.level]`; set `interactive: false`; skip zones with `polygon: null`
- [ ] 3.5 **GREEN** — Implement `loadZones()` and `renderZonePolygons()` so 3.3 passes
- [ ] 3.6 **RED** — Write failing map component test: clicking a canton polygon layer triggers `bindPopup` with name, code, level, parent_name
- [ ] 3.7 Add `onEachFeature` popup handler to zone `L.geoJSON` calls: `bindPopup` with name, `code ?? '---'`, level, `parent_name ?? '---'`; `interactive: true`; `bubblingMouseEvents: true`
- [ ] 3.8 **GREEN** — Implement popup handler so 3.6 passes

---

## Phase 4: Frontend Map — Cascading Zone Filters

> Prerequisite: Phase 3 tasks 3.1 complete.

- [ ] 4.1 Add `provincias`, `cantones`, `parroquias` signals to `frontend/src/app/features/map/components/map-filters/map-filters.component.ts`
- [ ] 4.2 Extend `FormGroup` in `MapFiltersComponent` with three new controls: `provincia_id: ['']`, `canton_id: [{ value: '', disabled: true }]`, `parroquia_id: [{ value: '', disabled: true }]`
- [ ] 4.3 **RED** — Write failing test: selecting a provincia value enables canton dropdown and calls `GeoZoneService.list({ level:'canton', parent_id })` (mock service)
- [ ] 4.4 Implement `valueChanges` subscription on `provincia_id` in `MapFiltersComponent`: reset canton + parroquia, enable/disable canton, call `loadZonesByParent('canton', provinciaId)`
- [ ] 4.5 Implement `valueChanges` subscription on `canton_id`: reset parroquia, enable/disable parroquia, call `loadZonesByParent('parroquia', cantonId)`
- [ ] 4.6 Implement `clearFilters()` reset: all six controls to `''`, canton/parroquia re-disabled
- [ ] 4.7 **GREEN** — Ensure 4.3 cascade test passes; add companion test for canton→parroquia chain and reset
- [ ] 4.8 Add `provincia_id`/`canton_id`/`parroquia_id` `<select>` elements to `frontend/src/app/features/map/components/map-filters/map-filters.component.html`; canton/parroquia disabled binding from `FormGroup`
- [ ] 4.9 **RED** — Write failing test: emitted `filtersChange` carries `zone_id` equal to most-specific selected id (`parroquia_id || canton_id || provincia_id`)
- [ ] 4.10 Wire `filtersChange` emit in `MapFiltersComponent` to include `zone_id`; update `MapComponent` filter handler to highlight selected zone layer and call `map.fitBounds()`
- [ ] 4.11 **GREEN** — Ensure 4.9 zone_id emission test passes

---

## Phase 5: Integration + Verification

> Prerequisite: Phases 1–4 complete.

- [ ] 5.1 **E2E** — Write/run e2e test in `backend/test/geo-zones-import-flow.e2e-spec.ts`: upload 3-canton fixture `.zip` → verify response envelope `{imported:3, skipped:0}` → query DB via `GET /geo-zones` → confirm `polygon` field present in response as valid GeoJSON
- [ ] 5.2 Run full backend test suite: `cd backend && npm test && npm run test:e2e` — all tests green
- [ ] 5.3 Run full frontend test suite: `cd frontend && npm test` — all tests green
- [ ] 5.4 Run lint and typecheck: `cd backend && npm run lint && npm run typecheck`; `cd frontend && npm run lint && npm run typecheck`
- [ ] 5.5 Run build: `cd backend && npm run build`; `cd frontend && npm run build`
- [ ] 5.6 Manual smoke: upload `test-fixture-3-cantons.zip` (< 10 MB) via UI dialog; verify map displays three cyan polygon boundaries; select matching Provincia in filter → map highlights and fits bounds
