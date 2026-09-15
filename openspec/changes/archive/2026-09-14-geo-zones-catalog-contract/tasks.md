# Tasks: Geo-Zones Catalog Contract

**Change**: `2026-09-05-geo-zones-catalog-contract`
**Status**: Ready for Implementation
**Layers**: Backend + Frontend

---

## Phase 1: Backend DTO & Validation (2–3 hours)

### T1.1 — Update CreateGeoZoneDto
- [ ] Open `backend/src/modules/geo-zones/dto/create-geo-zone.dto.ts`
- [ ] Change `polygon` field decorator: `@IsGeoJsonPolygon()` → `@IsOptional() @IsGeoJsonPolygon()`
- [ ] Verify `polygon?: GeoJsonGeometry` (optional parameter)
- [ ] Run `rtk npm run typecheck` → 0 errors
- [ ] No spec changes needed (validator unchanged, just optional flag)

### T1.2 — Add PostGIS Validation to Service
- [ ] Open `backend/src/modules/geo-zones/geo-zones.service.ts`
- [ ] In `create(dto)` method, after DTO validation:
  ```typescript
  if (dto.polygon) {
    const valid = await this.validateGeometry(dto.polygon);
    if (!valid) throw new BadRequestException('Invalid geometry');
  }
  ```
- [ ] Add private method `validateGeometry(polygon)`:
  - Call `ST_IsValid(polygon)` via DataSource.query()
  - Call `ST_DWithin(polygon, ecuador_bounds, 500km)` check
  - Return boolean (true if valid + in bounds)
- [ ] Update unit test: `geo-zones.service.spec.ts`
  - Test valid polygon → creates
  - Test invalid polygon → throws 400
  - Test null polygon → creates

### T1.3 — Run Backend Unit Tests
- [ ] `rtk jest backend/src/modules/geo-zones/geo-zones.service.spec.ts` → all pass
- [ ] `rtk jest backend/src/modules/geo-zones/dto/` → all pass

---

## Phase 2: Repository Queries (1–2 hours)

### T2.1 — Add Code Field to Tree CTE
- [ ] Open `backend/src/modules/geo-zones/geo-zones.repository.ts`
- [ ] Find `WITH RECURSIVE tree_query AS (...)` CTE
- [ ] In both `SELECT` statements (base + recursive), add `code` column:
  ```sql
  SELECT id, name, code, level, parent_id, ...
  ```
- [ ] Update `GeoZoneTreeRow` interface: add `code?: string`
- [ ] Update `GeoZoneNode` interface: add `code?: string`
- [ ] Run `rtk npm run typecheck` → 0 errors

### T2.2 — Geofencing: Add Polygon Filter
- [ ] Open `backend/src/modules/geofencing/geofencing.repository.ts`
- [ ] In `findZoneByPoint(lat, lng)` query:
  - Find: `WHERE active = true AND ST_Contains(polygon, ...)`
  - Change to: `WHERE active = true AND polygon IS NOT NULL AND ST_Contains(polygon, ...)`
- [ ] In `findZonesNearby(lat, lng, radius)` query:
  - Find: `WHERE active = true AND ST_DWithin(polygon, ...)`
  - Change to: `WHERE active = true AND polygon IS NOT NULL AND ST_DWithin(polygon, ...)`
- [ ] Run `rtk npm run typecheck` → 0 errors

### T2.3 — Run Repository Tests
- [ ] `rtk jest backend/src/modules/geo-zones/geo-zones.repository.spec.ts` → all pass
- [ ] `rtk jest backend/src/modules/geofencing/` → all pass (if exists)

---

## Phase 3: Integration Tests (2–3 hours)

### T3.1 — Test Shapefile POST Endpoint
- [ ] Open `backend/test/e2e/geo-zones.e2e-spec.ts` (or create if missing)
- [ ] Add test: POST /geo-zones with valid GeoJSON polygon
  - Mock shapefile geometry (valid EC-17 Pichincha bounds)
  - Assert: 201 created + zone.polygon is set
- [ ] Add test: POST /geo-zones with invalid geometry
  - Send self-intersecting polygon
  - Assert: 400 Bad Request + error message
- [ ] Add test: POST /geo-zones without polygon
  - Send { name, level, parent_id } only
  - Assert: 201 created + zone.polygon is NULL
- [ ] Add test: PATCH /geo-zones/:id with polygon null
  - Modify existing zone to clear geometry
  - Assert: 200 OK + zone.polygon is NULL

### T3.2 — Test Tree Endpoint Returns Code
- [ ] In `geo-zones.e2e-spec.ts`:
- [ ] Add test: GET /geo-zones/tree
  - Assert: response[0].code is present (string or null)
  - Assert: all nodes have id, name, code, level, children, active
  - Assert: tree structure preserved (children arrays correct)

### T3.3 — Test Geofencing Skips Null Polygon
- [ ] Open `backend/test/e2e/flows.e2e-spec.ts` (or regression tests)
- [ ] Add test scenario: incident routing with mixed polygon zones
  - Create zone_A with valid polygon
  - Create zone_B with polygon = NULL
  - Report incident inside zone_A bounds
  - Assert: incident.zone_id = zone_A.id (not zone_B, not random)
  - Assert: deterministic (run 5 times, always same result)

### T3.4 — Run Full E2E Suite
- [ ] `rtk npm run test:e2e` → all e2e tests pass
- [ ] Specifically: `t6-organizations-notified`, `flows`, `regressions` (high-touch tests)
- [ ] No timeouts, no flakes

---

## Phase 4: Frontend UI (3–4 hours)

### T4.1 — Install shpjs Library
- [ ] `cd frontend && npm install shpjs @types/shpjs`
- [ ] Verify `frontend/package.json` includes `shpjs: ^0.x`
- [ ] Run `rtk npm run build` → no errors

### T4.2 — Create ShapefileUploadDialog Component
- [ ] Create `frontend/src/app/shared/components/shapefile-upload-dialog/`
- [ ] Files:
  - `shapefile-upload-dialog.component.ts`
  - `shapefile-upload-dialog.component.html`
  - `shapefile-upload-dialog.component.spec.ts`
- [ ] Behavior:
  - Input: `@Input() center: { lat, lng }`
  - Output: `@Output() geometrySelected: EventEmitter<GeoJSON>`
  - Methods:
    - `onFileSelected(file)` → read `.zip`
    - `parseShapefile()` → call shpjs
    - `showPreview(geojson)` → render on map
    - `accept()` → emit geometry
    - `cancel()` → close dialog

### T4.3 — Integrate Dialog into Location Form
- [ ] Open `frontend/src/app/features/catalogs/locations/location-form/location-form.component.ts`
- [ ] Add button: "Subir Shapefile" in template
- [ ] On click: open dialog
- [ ] On geometry received: set form field `polygon = geojson`
- [ ] Display status: "Geometría cargada ✓" or "Sin geometría (es opcional)"
- [ ] Run `rtk jest --testPathPatterns='location-form'` → tests pass

### T4.4 — Test Frontend Components
- [ ] `rtk jest frontend/src/app/shared/components/shapefile-upload-dialog/` → all pass
- [ ] `rtk jest frontend/src/app/features/catalogs/locations/location-form/` → all pass
- [ ] `rtk npm run build` → no errors
- [ ] Manual: open form → click "Subir Shapefile" → select test .zip → see preview → accept

---

## Phase 5: Full Integration & Regression (2–3 hours)

### T5.1 — Run Full Backend Suite
- [ ] `cd backend && rtk npm run lint` → 0 errors
- [ ] `cd backend && rtk npm run typecheck` → 0 errors
- [ ] `cd backend && rtk jest` → all unit tests pass
- [ ] `cd backend && rtk npm run test:e2e` → all e2e tests pass

### T5.2 — Run Full Frontend Suite
- [ ] `cd frontend && rtk jest` → all tests pass
- [ ] `cd frontend && rtk npm run build` → dist/ complete

### T5.3 — Manual Smoke Test (End-to-End)
- [ ] Start backend + frontend locally
- [ ] Login as admin (READ + CREATE geo-zones)
- [ ] Open Locations catalog
- [ ] Test workflow A: Upload shapefile
  - Click "Crear zona"
  - Fill: name="Pichincha", level="province"
  - Click "Subir Shapefile"
  - Upload `test/fixtures/ec-17-pichincha.zip`
  - See polygon preview on map ✓
  - Click "Aceptar"
  - Fill: code="EC-17"
  - Click "Guardar"
  - Assert: zone created + polygon set
- [ ] Test workflow B: Create without geometry
  - Click "Crear zona"
  - Fill: name="Zone-X", level="custom"
  - Skip "Subir Shapefile"
  - Click "Guardar"
  - Assert: zone created + polygon = NULL
- [ ] Test workflow C: View tree
  - Open map or incidents
  - Verify incidents route to zones with geometry (not NULL)
  - Verify "Zone-X" exists in catalog but doesn't interfere with geofencing
- [ ] Test workflow D: Edit zone
  - Open "Pichincha" (has polygon)
  - Click "Editar"
  - Clear polygon (set to null)
  - Save
  - Assert: zone.polygon = NULL in DB

### T5.4 — Verify No Regressions
- [ ] Run existing e2e for incidents/flows → all pass
- [ ] Verify old seeded zones (EC-24, 3 cantons, 11 parroquias) still visible + route correctly
- [ ] Check: catalog loads tree endpoint (no timeouts)

---

## Phase 6: Documentation & Cleanup (1 hour)

### T6.1 — Update README / Wiki
- [ ] Add section: "Shapefile Upload for Zones"
- [ ] Link to spec + design
- [ ] Example: `POST /geo-zones { name: "...", polygon: {...} }`

### T6.2 — Add Code Comments
- [ ] `geo-zones.service.ts`: explain PostGIS validation
- [ ] `geofencing.repository.ts`: explain `polygon IS NOT NULL` filter
- [ ] `shapefile-upload-dialog.component.ts`: explain shpjs flow

### T6.3 — Create Test Fixtures
- [ ] Add shapefile test files to `backend/test/fixtures/`
  - `ec-17-pichincha.zip` (valid polygon)
  - `invalid-self-intersect.zip` (invalid geometry)
  - `outside-bounds.zip` (Peru polygon)

---

## Checklist Summary

**Backend**:
- [ ] DTO: polygon optional (T1.1)
- [ ] Service: PostGIS validation (T1.2)
- [ ] Unit tests pass (T1.3)
- [ ] Tree CTE: add code (T2.1)
- [ ] Geofencing: add polygon filter (T2.2)
- [ ] Repo tests pass (T2.3)
- [ ] E2E tests pass (T3.1–T3.4)
- [ ] Full lint + typecheck + test suite (T5.1)

**Frontend**:
- [ ] shpjs installed (T4.1)
- [ ] ShapefileUploadDialog component (T4.2)
- [ ] Location form integration (T4.3)
- [ ] Component tests pass (T4.4)
- [ ] Jest + build pass (T5.2)
- [ ] Manual smoke tests pass (T5.3)

**Overall**:
- [ ] No regressions (T5.4)
- [ ] Documentation updated (T6.1–T6.2)
- [ ] Test fixtures created (T6.3)
- [ ] Ready for verification
