# Design: Geo-Zones Catalog Contract

**Change**: `2026-09-05-geo-zones-catalog-contract`
**Scope**: Shapefile upload + tree enhancement + optional polygon + geofencing safety
**Date**: 2026-09-05

---

## Architecture Decisions

### D1: Shapefile Parsing Happens in Frontend (Not Backend)

**Decision**: Use `shpjs` (JavaScript library) to parse `.zip` → GeoJSON in browser. Backend receives only GeoJSON.

**Rationale**:
- Avoids GDAL/ogr2ogr dependency on backend (heavy, system-level library)
- Instant feedback to user (see polygon on map before sending)
- Reduces server load (parsing offloaded to client)
- Reusable for future geometry edits (Leaflet.Draw later)
- No new backend endpoint needed; reuse `POST /geo-zones`

**Rejected alternative**: Backend parses shapefile
- Requires GDAL/ogr2ogr install (infrastructure cost)
- No preview before send
- Slower feedback loop
- Tied to backend scale

---

### D2: Polygon Field Becomes Optional in CreateGeoZoneDto

**Decision**: `@IsOptional()` decorator on `CreateGeoZoneDto.polygon` field.

**Rationale**:
- Current: placeholder geometry sent by all users → geofencing broken
- New: user skips shapefile upload → zone created with `polygon = NULL`
- Zones without geometry don't participate in geofencing (filtered in `findZoneByPoint`)
- Unblocks catalog for zones that don't need geofencing (meta-zones, administrative-only, etc)
- Progressive: user can upload geometry later via PATCH (already supported by UpdateGeoZoneDto)

**Rationale for NOT doing Leaflet.Draw**:
- Shapefile is source of truth (GIS system already has data)
- Drawing is expert tool (requires GIS knowledge or manual tracing)
- Shapefile upload is 80% use case; drawing is future enhancement

---

### D3: Validation Happens Only in Backend

**Decision**: Backend `GeoZonesService.create()` validates polygon (if provided) with PostGIS.

**Rationale**:
- Frontend preview is UX only (not authoritative)
- Backend is source of truth for data integrity
- Prevents malicious/corrupted GeoJSON
- Single validation point (no duplicate logic)
- Tests live in backend, easier to verify

**Validators**:
- `ST_IsValid(polygon)` — no self-intersections, topology correct
- `ST_DWithin(polygon, ecuador_center, 500km)` — plausibly within Ecuador (with margin)
- No overlap check (decided: not a blocker; user can split zones later)

---

### D4: Geofencing Filters by Polygon Presence

**Decision**: `findZoneByPoint` and `findZonesNearby` add `AND polygon IS NOT NULL`.

**Rationale**:
- Zones without geometry can't be spatially queried
- `ST_Contains(NULL, point)` returns NULL (not false) → query behaves unpredictably
- Filter prevents false negatives and undefined routing behavior
- Safe: zones without polygon simply don't match (no error)

**Impact**:
- Incident routing deterministic (never hits zone with `polygon IS NULL`)
- User sees incident assigned to a zone with real geometry
- Fixes latent bug where `LIMIT 1` without `ORDER BY` was non-deterministic when zones overlapped

---

### D5: Tree Endpoint Projects Code (Was Missing)

**Decision**: `GET /geo-zones/tree` response includes `code` field in each node.

**Rationale**:
- Catalog CRUD needs code to display in UI (admin sees EC-17, EC-24-01, etc)
- Tree is hierarchical view; code is node identifier
- One-line change in CTE: add `code` to `SELECT` list
- No geometry needed (tree is metadata-only)

**Schema**:
```typescript
interface GeoZoneNode {
  id: string;
  name: string;
  code?: string;      // NEW
  level: GeoZoneLevel;
  active: boolean;
  children: GeoZoneNode[];
}
```

---

### D6: UpdateGeoZoneDto.polygon Already Optional (No Change)

**Decision**: No change to `UpdateGeoZoneDto` — `polygon` already has `@IsOptional()`.

**Rationale**:
- User can edit zone name, level, code without touching geometry
- User can clear geometry with `PATCH /geo-zones/:id { polygon: null }`
- Symmetric with CREATE: both allow null

---

### D7: No New Backend Endpoint

**Decision**: Reuse `POST /geo-zones` endpoint. No new endpoint needed.

**Rationale**:
- DTO already accepts polygon (now optional)
- Validation already exists
- Controller already guards with `RequirePermission('CREATE')`
- Changes only:
  - Add `@IsOptional()` to DTO
  - Add PostGIS validation to service
  - Add `polygon IS NOT NULL` filter to geofencing queries

---

### D8: Tree Pagination Not Needed

**Decision**: `GET /geo-zones/tree` returns ALL zones without pagination.

**Rationale**:
- Tree is recursive (parent-child relationships must be complete)
- Pagination would break hierarchy
- ~1,700 zones (Ecuador full) = ~100 KB JSON, acceptable
- Frontend already has workaround for paginated listall() if needed

---

## File Structure (Changes)

```
backend/src/
├── modules/geo-zones/
│   ├── dto/
│   │   ├── create-geo-zone.dto.ts         (CHANGE: polygon @IsOptional())
│   │   └── update-geo-zone.dto.ts         (NO CHANGE: already optional)
│   ├── geo-zones.service.ts               (CHANGE: add PostGIS validation)
│   ├── geo-zones.repository.ts            (CHANGE: add code to tree CTE)
│   └── geo-zones.controller.ts            (NO CHANGE)
└── modules/geofencing/
    └── geofencing.repository.ts           (CHANGE: add polygon IS NOT NULL filter)
```

---

## Testing Strategy

### Unit Tests

**geo-zones.service.spec.ts**:
- `create()` with polygon → validates ST_IsValid ✓
- `create()` with polygon outside bounds → returns 400 ✓
- `create()` without polygon → accepts ✓
- `update()` can clear polygon (set to null) ✓

**geofencing.repository.spec.ts**:
- `findZoneByPoint()` skips zones with `polygon IS NULL` ✓
- `findZonesNearby()` skips zones with `polygon IS NULL` ✓
- Incident routed to zone with geometry, not placeholder ✓

### Integration Tests

**geo-zones.e2e-spec.ts**:
- POST /geo-zones with valid shapefile geometry → 200 ✓
- POST /geo-zones with invalid geometry → 400 ✓
- GET /geo-zones/tree includes code field ✓
- PATCH /geo-zones/:id { polygon: null } → 200 ✓

**flows.e2e-spec.ts** (T6 regression):
- Incident routed to correct zone (with geometry, not placeholder) ✓
- No non-deterministic routing (LIMIT 1 no longer picks random zone) ✓

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PostGIS validation too strict | Medium | Use `ST_Buffer(polygon, -0.0001)` to auto-heal minor topology issues; test with real Ecuador shapefiles |
| Zones without polygon break reports | Low | Filter `polygon IS NOT NULL` catches this; test in t6-organizations-notified |
| Tree endpoint too slow with 1.7k zones | Low | Recursive CTE is O(n); JSON serialize ~100ms; acceptable for catalog load |
| User confused: "why is my zone not in geofencing?" | Medium | UI: display badge "No geometry" on zones with polygon=NULL; tooltip explains |

---

## Rollback Plan

1. Revert `CreateGeoZoneDto.polygon` → `@IsNotEmpty()` (required again)
2. Revert geofencing filters (remove `polygon IS NOT NULL`)
3. Delete code from tree CTE
4. Zones created without geometry would need manual geometry assignment via DB or UI re-edit with placeholder (same current state)
