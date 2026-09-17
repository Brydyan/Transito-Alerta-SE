# Specification: Geo-Zones Catalog Contract

**Change**: `2026-09-05-geo-zones-catalog-contract`
**Scope**: Shapefile upload for zone geometry + tree endpoint enhancement + optional polygon + geofencing safety
**Date**: 2026-09-05

---

## Overview

GeoZones catalog must support:
1. **Shapefile upload** — User uploads `.zip` containing shapefile, frontend parses → preview on map → backend validates + creates zone
2. **Tree endpoint enhancement** — `GET /geo-zones/tree` projects `code` field (for catalog CRUD)
3. **Optional polygon** — `CreateGeoZoneDto.polygon` becomes optional to avoid placeholder geometry
4. **Geofencing safety** — `findZoneByPoint` / `findZonesNearby` filter by `polygon IS NOT NULL` to exclude zones without real geometry

---

## Requirements

### R1: Shapefile Upload Endpoint Already Exists

**Acceptance**:
- `POST /geo-zones` accepts `CreateGeoZoneDto { name, level, parent_id, polygon?, code?, active? }`
- No NEW endpoint needed; re-use existing `create()` in `geo-zones.controller.ts`
- Frontend sends parsed GeoJSON as `polygon` field

### R2: Tree Endpoint Projects `code`

**Acceptance**:
- `GET /geo-zones/tree` returns `GeoZoneNode[]` where each node has `code` field
- Schema: `{ id, name, code, level, children: GeoZoneNode[], active }`
- `code` extracted from `WITH RECURSIVE` CTE in `geo-zones.repository.ts`
- No `polygon` / `ST_AsGeoJSON` — tree is lightweight (catalog metadata only)

### R3: CreateGeoZoneDto.polygon Is Optional

**Acceptance**:
- `CreateGeoZoneDto.polygon` decorated with `@IsOptional()` (no change to validator, keep `@IsGeoJsonPolygon()`)
- When absent: zone created with `polygon = NULL`
- When present: backend validates (R4)
- `UpdateGeoZoneDto.polygon` remains optional (already is)

### R4: Backend Validates Geometry

**Acceptance**:
- `GeoZonesService.create()` validates polygon (if provided):
  - `ST_IsValid(polygon)` = true
  - Point inside Ecuador bounds (±500km margin): `ST_DWithin(polygon, ecuador_bounds, 500km)`
  - Returns 400 Bad Request if invalid
- No validation if `polygon IS NULL`

### R5: Geofencing Filters by Polygon Present

**Acceptance**:
- `GeofencingRepository.findZoneByPoint(lat, lng)` modified:
  - Old: `SELECT ... WHERE active = true AND ST_Contains(polygon, point) LIMIT 1`
  - New: `SELECT ... WHERE active = true AND polygon IS NOT NULL AND ST_Contains(polygon, point) LIMIT 1`
- `findZonesNearby(lat, lng, radius)` modified:
  - Adds: `AND polygon IS NOT NULL` to WHERE clause
- Zones without polygon ignored for geofencing (not error, just skipped)

### R6: Tree Endpoint Includes Both Seeded + User-Created Zones

**Acceptance**:
- `GET /geo-zones/tree` returns all zones (seeded + created via UI), regardless of `polygon IS NULL`
- No filtering by polygon presence (catalog shows all, including those without geometry)
- Catalog can list / edit / delete all zones

### R7: Listall() Pagination Remains

**Acceptance**:
- Frontend `GeoZoneService.listAll()` continues to paginate `GET /geo-zones` to handle >100 zones
- Backend `findAll()` still caps `MAX_PAGE_SIZE = 100`
- Tree endpoint `GET /geo-zones/tree` remains complete (no pagination)

### R8: Import Reuses Repository Create

**Acceptance**:
- When the import endpoint processes features, `GeoZonesRepository.create()` MUST be called once per feature within the import transaction
- The import flow MUST NOT bypass repository-level validation (geometry, bounds)
- Each call receives the same DTO shape as a manual `POST /geo-zones` call

#### Scenario: Repository create called per imported feature

- GIVEN a valid zip with 5 features
- WHEN `POST /geo-zones/import` processes the features
- THEN `GeoZonesRepository.create()` is called exactly 5 times (minus skipped)
- AND each call receives the same DTO shape as a manual `POST /geo-zones` call

---

## Scenarios

### Scenario 1: User Uploads Shapefile with Valid Geometry

```
Given user opens location-form.component
When clicks "Subir Shapefile"
And selects Ecuador_Provinces.zip
And browser parses with shpjs
Then modal shows GeoJSON geometry on map
And user sees polygon preview
And user clicks "Aceptar"
Then POST /geo-zones { name: "Pichincha", level: "province", polygon: {...}, code: "EC-17" }
And backend validates ST_IsValid = true
And backend checks bounds (inside Ecuador)
And zone created with polygon
And returns 200 + zone object
```

### Scenario 2: User Creates Zone Without Polygon

```
Given user opens location-form
When clicks "Crear zona sin geometría"
And fills: name="Zona Ad-hoc", level="canton"
And skips "Subir Shapefile"
Then POST /geo-zones { name, level, polygon: undefined }
And backend accepts (polygon is optional)
And zone created with polygon = NULL
And returns 200 + zone object
```

### Scenario 3: Incident Routing Skips Zones Without Polygon

```
Given zone_A (Pichincha) has polygon = ST_Multi(...)
And zone_B (Sto. Domingo) has polygon = NULL
When incident reported at lat=-0.35, lng=-78.52 (inside both bounds)
Then findZoneByPoint calls query with: AND polygon IS NOT NULL
And only zone_A (with geometry) matches
And incident routed to zone_A
```

### Scenario 4: Catalog Lists All Zones

```
Given zone_A has polygon
And zone_B has polygon = NULL
When GET /geo-zones/tree
Then response includes both zone_A and zone_B
And zone_B is renderable (name, level, code visible)
And tree is complete (no zones hidden)
```

### Scenario 5: Invalid Geometry Rejected

```
Given user uploads shapefile with self-intersecting polygon
When backend receives POST /geo-zones
And ST_IsValid(polygon) = false
Then returns 400 Bad Request
And error message: "Invalid geometry: self-intersecting polygon"
And zone not created
```

### Scenario 6: Geometry Outside Ecuador Rejected

```
Given user uploads shapefile for Peru
When backend receives polygon with bounds outside Ecuador
And ST_DWithin(polygon, ecuador_center, 500km) = false
Then returns 400 Bad Request
And error message: "Geometry outside Ecuador bounds"
And zone not created
```

### Scenario 7: Tree Endpoint Includes Code Field

```
Given zones seeded with code='EC-17' (Pichincha), code='EC-09' (Guayas)
When GET /geo-zones/tree
Then response includes nodes: [{ id, name, code: 'EC-17', level, children }, { id, name, code: 'EC-09', ... }]
And code field always present (null if not set, but field exists)
And frontend can render code in catalog UI
```

### Scenario 8: Edit Zone Can Clear Polygon

```
Given zone_A has polygon = ST_Multi(...)
When PATCH /geo-zones/:id { polygon: null }
Then backend accepts (UpdateGeoZoneDto.polygon is optional)
And zone_A.polygon becomes NULL
And zone no longer participates in geofencing
```

---

## Out of Scope

- Leaflet.Draw or polygon drawing UI (frontend draws via shapefile only)
- GDAL/ogr2ogr on backend (parsing happens in browser)
- Multi-file shapefile handling (shpjs handles all file types in .zip)
- Topology validation beyond ST_IsValid (e.g., no detection of "almost valid" geometries)
- Historical audit of polygon changes (basic CRUD only)
