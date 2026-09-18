# Proposal: Geo-Zones Shapefile Bulk Import + Map Zone Filters

## Intent

The geo-zones catalog supports single-zone CRUD with placeholder polygons, and the map shows all zones with basic status/priority/category filters. There is no way to bulk-import real administrative boundaries, no zone-scoped incident filtering, and no visual zone selection on the map. Operators managing Santa Elena's 3 cantons and 11 parroquias must create each zone by hand and cannot filter the map by jurisdiction.

This change adds: (1) a backend bulk-import endpoint that parses shapefiles into geo_zones rows, (2) a frontend upload + preview flow in the location form, (3) canton/parroquia filter dropdowns on the map, and (4) zone boundary highlighting with auto-zoom.

## Scope

### In Scope
- `POST /geo-zones/import` backend endpoint (multipart .zip upload, `shpjs` parse, bulk validate + insert)
- Import response envelope: `{ imported: N, skipped: N, errors: [{ name, reason }] }`
- Geometry validation per feature (reuse `validateGeometry`, Ecuador bounds check)
- Level detection: caller specifies target level; name/code from shapefile attribute columns
- Parent resolution: match parent by `code` column (existing rows) or by spatial containment (`ST_Contains`)
- Duplicate handling: skip zones whose `code` already exists (partial unique index from migration 0035)
- File size guard: reject uploads > 10 MB before parsing
- Frontend: file input (.zip) in location-form with "Import Shapefile" alternative action
- Frontend: preview modal showing parsed features on a Leaflet map + column-mapping form (shapefile attribute -> name/code)
- Frontend: map-filters additions: canton dropdown, parroquia dropdown (cascading, loaded from `GET /geo-zones?level=canton`)
- Frontend: `MapActiveFilters.zone_id` added; `getIncidentsFeed()` passes `zone_id` query param
- Frontend: selected zone boundary highlighted (red, weight 3) + `map.fitBounds()` on selection
- Frontend: incidents filtered client-side to selected zone (until backend supports `zone_id` filter on `/incidents/feed`)
- Permission: `CREATE geo-zones` (already seeded in migration 0013)

### Out of Scope
- Bulk edit/update of imported zones
- Shapefiles for regions outside Ecuador (bounds check rejects)
- Leaflet.Draw or manual polygon drawing
- Backend `/incidents/feed?zone_id=` query support (separate change; client-side filter is interim)
- GDAL/ogr2ogr server-side conversion
- `.shp` upload without `.zip` wrapper (shpjs requires the .zip bundle)
- Import rollback (undo an import batch)
- Multi-file or drag-and-drop upload

## Capabilities

### New Capabilities
- `geo-zones-import`: Bulk shapefile upload endpoint, parse, validate, and insert multiple geo_zones rows in one request
- `map-zone-filters`: Canton/parroquia cascading dropdowns on the map, zone boundary highlight, auto-zoom

### Modified Capabilities
- `geo-zones-catalog`: `CreateGeoZoneDto.polygon` already optional per archived spec; no schema change needed. Import reuses `GeoZonesRepository.create()` in a loop.
- `map-ui-support`: `MapActiveFilters` gains `zone_id`; `MapFiltersComponent` gains two dropdowns

## Approach

**Backend**: New `POST /geo-zones/import` in `GeoZonesController`. Uses `@UseInterceptors(FileInterceptor('file'))` from `@nestjs/platform-express` with a 10 MB limit. Service method: parse zip buffer with `shpjs` (returns GeoJSON FeatureCollection), iterate features, for each: extract name/code from user-specified attribute columns, validate geometry (reuse `assertValidGeometry`), resolve parent by code lookup or `ST_Contains`, call `repo.create()`. Wrap in a transaction; on any DB error, roll back all. Return summary envelope.

**Frontend upload**: In location-form, add a secondary action "Importar Shapefile". File input accepts `.zip`. On file select, parse in browser with `shpjs`, open a modal showing features on a mini Leaflet map. User maps shapefile attribute columns to `name` and `code` via dropdowns. User selects target `level`. Submit sends the .zip to `POST /geo-zones/import` with column mapping as query params.

**Frontend map filters**: Add `canton_id` and `parroquia_id` form controls to `MapFiltersComponent`. Load cantons from `GET /geo-zones?level=canton`. On canton select, load parroquias filtered by `parent_id`. On zone select, highlight boundary layer in red, `fitBounds()`, and pass `zone_id` to incident feed.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/modules/geo-zones/geo-zones.controller.ts` | Modified | New `import()` route handler |
| `backend/src/modules/geo-zones/geo-zones.service.ts` | Modified | New `importShapefile()` method |
| `backend/src/modules/geo-zones/dto/import-geo-zone.dto.ts` | New | DTO for column mapping + level |
| `frontend/.../locations/location-form/` | Modified | File input + import modal |
| `frontend/.../locations/services/geo-zone.service.ts` | Modified | New `importShapefile()` method |
| `frontend/.../map/components/map-filters/` | Modified | Canton/parroquia dropdowns |
| `frontend/.../map/services/map-data.service.ts` | Modified | `zone_id` in `MapActiveFilters` |
| `frontend/.../map/map.component.ts` | Modified | Zone highlight layer + fitBounds |
| `package.json` (backend) | Modified | Add `shpjs` dependency |
| `package.json` (frontend) | Modified | Add `shpjs` dependency (for browser parse) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Malformed shapefiles crash `shpjs` | Med | Wrap parse in try/catch; return user-friendly error |
| Parent deduction fails (no `code` match, no spatial containment) | Med | Import with `parent_id = null`; report as warning in response |
| Large shapefile (>1000 features) slow to insert | Low | Transaction with bulk insert; 10 MB file limit |
| `shpjs` bundle size bloats frontend | Low | Lazy-load module; `shpjs` is ~40 KB gzipped |
| Zone_id filter on feed not backend-supported | High | Client-side filter is interim; document as tech debt |

## Rollback Plan

- Backend: remove `import()` route + `importShapefile()` service method. No migration needed (uses existing `geo_zones` table).
- Frontend: revert location-form to remove file input/modal. Revert map-filters to remove zone dropdowns. No data migration needed.
- `shpjs` dependency can be removed from both package.json files.

## Dependencies

- `shpjs` npm package (MIT, ~40 KB gzipped) for shapefile parsing
- Existing `geo_zones` table with `code` column (migration 0035) and `polygon IS NOT NULL` partial index
- Existing `CREATE geo-zones` permission (migration 0013)
- `@nestjs/platform-express` `FileInterceptor` (already a NestJS dependency)

## Success Criteria

- [ ] Upload a .zip shapefile with 3 cantons -> 3 rows created in `geo_zones` with correct polygons, levels, and parent_ids
- [ ] Invalid geometries in shapefile produce per-feature errors, not a full rejection
- [ ] Map canton dropdown loads dynamically; selecting a canton loads its parroquias
- [ ] Selected zone boundary highlighted in red; map zooms to fit
- [ ] Incidents outside selected zone visually filtered on the map
- [ ] Import of duplicate codes (already in DB) skips without error
