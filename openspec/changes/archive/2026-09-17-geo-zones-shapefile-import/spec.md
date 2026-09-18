# Spec: geo-zones-shapefile-import

**Change**: `geo-zones-shapefile-import`
**Date**: 2026-09-15
**Store**: openspec

---

## Overview

This change adds bulk shapefile import for administrative boundary zones and zone-scoped map filtering. It covers: a new `POST /geo-zones/import` endpoint, frontend upload flow in the location form, cascading zone filter dropdowns on the map, zone boundary highlighting, and zone-scoped incident filtering.

---

## Requirement Group 1: Frontend Location Form (Upload UI)

### Requirement R1: Location Form Upload Panel

The `/app/ubicaciones/new` route MUST render a two-panel form.
The left panel MUST contain: Nombre (text), Código (text), Nivel (dropdown: cantón/parroquia/provincia/sector), Padre (selector populated by `GET /geo-zones/form-data`).
The right panel MUST contain: an "Importar Shapefile" upload button and a progress bar.
The form MUST be guarded by `CREATE geo-zones` permission.

#### Scenario: Form renders both panels for authorized user

- GIVEN a user with `CREATE geo-zones` permission navigates to `/app/ubicaciones/new`
- WHEN the page loads
- THEN the left panel displays Nombre, Código, Nivel dropdown, and Padre selector
- AND the right panel displays an "Importar Shapefile" button and a progress bar (hidden by default)

#### Scenario: Unauthorized user cannot access form

- GIVEN a user WITHOUT `CREATE geo-zones` permission
- WHEN the user navigates to `/app/ubicaciones/new`
- THEN the route guard redirects or returns 403
- AND the upload button is not rendered

#### Scenario: Nivel dropdown contains all four levels

- GIVEN the form is open
- WHEN the Nivel dropdown is inspected
- THEN it contains exactly: cantón, parroquia, provincia, sector (in any order)

### Requirement R2: Shapefile Upload Integration

The "Importar Shapefile" button MUST open a file picker limited to `.zip` files.
On file selection the frontend MUST POST to `POST /geo-zones/import` using `multipart/form-data` with the `file` field.
The request MUST be rejected client-side if the file exceeds 10 MB before submission.

#### Scenario: Valid zip triggers multipart POST

- GIVEN a user selects `cantons.zip` (3 MB)
- WHEN the upload button is clicked and file is confirmed
- THEN the frontend sends `POST /geo-zones/import` as `multipart/form-data` with `file = cantons.zip`
- AND the content-type header is `multipart/form-data`

#### Scenario: File over 10 MB rejected before upload

- GIVEN a user selects a `.zip` file of 12 MB
- WHEN the file is selected in the picker
- THEN the frontend shows a validation error without sending any HTTP request
- AND the error message states the 10 MB limit

#### Scenario: Non-zip file rejected by file picker

- GIVEN the file picker is open
- WHEN the user attempts to select a `.pdf` file
- THEN the picker filter prevents selection or the frontend shows an unsupported format error

### Requirement R3: Upload Progress Tracking

The frontend MUST track HTTP upload progress via `HttpClient` events (`UploadProgress`).
While uploading, the right panel MUST display a progress bar reflecting bytes uploaded vs total.
On completion (success or error) the progress bar MUST return to its idle/hidden state.

#### Scenario: Progress bar advances during upload

- GIVEN a valid zip is being uploaded
- WHEN the HTTP `UploadProgress` event fires at 50%
- THEN the progress bar displays 50% fill
- AND the upload button is disabled during transmission

#### Scenario: Progress bar resets after success

- GIVEN upload completes with 200 response
- WHEN the success response is received
- THEN the progress bar resets to 0 (or is hidden)
- AND a success notification is shown with import summary (imported, skipped counts)

#### Scenario: Progress bar resets after error

- GIVEN upload completes with a 4xx or 5xx response
- WHEN the error response is received
- THEN the progress bar resets
- AND the error message from the response body is displayed to the user

---

## Requirement Group 2: Map Display (Zone Polygons)

### Requirement R4: Zone Polygons Rendered by Type

The `/app/mapa` map MUST render zone boundary polygons for all active zones with a non-null polygon.
Polygon stroke color MUST differ by zone level: cantones = one distinct color, parroquias = another, provincias = another, sectores = another.
Fill MUST be semi-transparent. Polygons MUST not block click events on underlying incident markers.

#### Scenario: Four zone levels render with distinct colors

- GIVEN active zones exist for all four levels (provincia, cantón, parroquia, sector)
- WHEN the map loads
- THEN polygon boundaries are rendered for each level
- AND each level uses a visually distinct stroke color

#### Scenario: Zones with null polygon are not rendered

- GIVEN a zone record has `polygon = NULL`
- WHEN the map renders zone layers
- THEN no polygon is added to the map for that zone
- AND no error is thrown

#### Scenario: Polygon click does not block incident marker click

- GIVEN a zone polygon and an incident marker overlap on the map
- WHEN the user clicks on the incident marker area
- THEN the incident marker click handler fires, not the polygon handler

---

## Requirement Group 3: Map Zone Filters (Cascading Dropdowns)

### Requirement R5: Cascading Zone Filter Dropdowns

The map filter panel MUST expose three cascading dropdowns: Provincia, Cantón, Parroquia (in that order).
Each loads from `GET /geo-zones?level=<level>&active=1`.
Cantón MUST be disabled until a Provincia is selected; it MUST query `?level=canton&parent_id=<provincia_id>`.
Parroquia MUST be disabled until a Cantón is selected; it MUST query `?level=parroquia&parent_id=<canton_id>`.
Changing a parent selection MUST reset all child dropdowns.

#### Scenario: Provincia selection enables Cantón dropdown

- GIVEN the map filter panel is open with all dropdowns empty
- WHEN the user selects Provincia "Santa Elena"
- THEN the Cantón dropdown is enabled and loads `GET /geo-zones?level=canton&parent_id=<santa_elena_id>&active=1`
- AND Parroquia remains disabled and empty

#### Scenario: Cantón selection enables Parroquia dropdown

- GIVEN Provincia is selected
- WHEN the user selects Cantón "Santa Elena" (cantón)
- THEN Parroquia dropdown enables and loads `GET /geo-zones?level=parroquia&parent_id=<canton_id>&active=1`

#### Scenario: Changing Provincia resets Cantón and Parroquia

- GIVEN Provincia A, Cantón X, Parroquia Y are selected
- WHEN the user changes Provincia to Provincia B
- THEN Cantón resets to empty and reloads for Provincia B
- AND Parroquia resets to empty and is disabled

#### Scenario: Reset clears all zone selections

- GIVEN any combination of zone filters is active
- WHEN the user clicks Reset
- THEN all three dropdowns return to empty and Cantón/Parroquia become disabled

### Requirement R6: Polygon Click Zone Details

Clicking on a zone boundary polygon MUST display a detail panel or tooltip showing: zone name, code, type (level), and parent name (if any).
The detail MUST not require a separate API call if polygon layer already carries this metadata.

#### Scenario: Click on canton polygon shows details

- GIVEN the map displays canton polygons with metadata (name, code, level, parent)
- WHEN the user clicks on a canton polygon
- THEN a tooltip/panel appears showing the zone name, code, type, and parent name
- AND the display does not trigger a new HTTP request

#### Scenario: Click on zone with no parent shows empty parent field

- GIVEN a provincia polygon has no parent
- WHEN the user clicks on it
- THEN the detail shows name, code, type (provincia) and parent field is empty or "—"

---

## Requirement Group 4: Import Endpoint (Backend)

### Requirement R7: POST /geo-zones/import Endpoint

The system MUST expose `POST /geo-zones/import` accepting `multipart/form-data` with a `file` field.
The caller MUST hold `CREATE geo-zones` permission (guard applied at controller level).
File MUST be a `.zip` archive. Maximum size is 10 MB; requests exceeding this MUST be rejected before parsing with status 400.
The response on success MUST be HTTP 200 with the import envelope:
`{ imported: number, skipped: number, errors: Array<{index, name, reason}>, warnings: string[] }`.

#### Scenario: Valid import returns summary envelope

- GIVEN caller has `CREATE geo-zones` permission
- WHEN `POST /geo-zones/import` receives a valid `.zip` (< 10 MB, 3 canton features)
  with `?level=canton&auto_parent=true`
- THEN response status is 200
- AND body is `{ imported: 3, skipped: 0, errors: [], warnings: [] }`
- AND 3 rows are inserted into `geo_zones` with `level = 'canton'`

#### Scenario: File exceeds 10 MB — rejected before parse

- GIVEN caller has permission
- WHEN the uploaded `.zip` is 11 MB
- THEN response status is 400
- AND body contains an error message referencing the size limit
- AND no rows are inserted

#### Scenario: Wrong file type

- GIVEN caller uploads a `.pdf` or a `.zip` missing `.shp`
- WHEN `POST /geo-zones/import` receives the file
- THEN response status is 400
- AND error message indicates unsupported format or missing shapefile members

#### Scenario: Unauthenticated request

- GIVEN no Authorization header
- WHEN `POST /geo-zones/import` is called
- THEN response status is 401

#### Scenario: Caller without CREATE permission

- GIVEN caller is authenticated but lacks `CREATE geo-zones`
- WHEN `POST /geo-zones/import` is called
- THEN response status is 403

---

## Requirement Group 5: Shapefile Validation (Backend)

### Requirement R8: Per-Feature Validation Rules

The system MUST validate each parsed GeoJSON feature individually.
A feature MUST be rejected (added to `errors`, skipped from insert) when any of:
- `ST_IsValid(geometry)` is false
- Geometry centroid is > 500 km from Ecuador centroid (outside Ecuador bounds)
- `name` attribute is empty or > 255 characters
- `code` attribute (if present) is > 32 characters

Failed features MUST NOT cause the entire import to fail. Valid features MUST be inserted.

#### Scenario: Self-intersecting polygon rejected per-feature

- GIVEN a zip with 5 features, feature index 2 is self-intersecting
- WHEN `POST /geo-zones/import?level=parroquia` is called
- THEN response is `{ imported: 4, skipped: 0, errors: [{ index: 2, name: "...", reason: "Invalid geometry" }], warnings: [] }`
- AND 4 rows are inserted; no row for index 2

#### Scenario: Geometry outside Ecuador bounds rejected

- GIVEN a feature whose centroid is in Peru
- WHEN `POST /geo-zones/import?level=canton` is called
- THEN that feature appears in `errors` with reason `"Geometry outside Ecuador bounds"`
- AND it is not inserted

#### Scenario: Empty name rejected

- GIVEN a feature whose `name` attribute is an empty string
- WHEN the feature is validated
- THEN it appears in `errors` with a reason indicating name is required
- AND it is not inserted

#### Scenario: Duplicate code skipped without error

- GIVEN `geo_zones` contains a row with `code = 'EC-09'`
- WHEN a feature has `code = 'EC-09'`
- THEN the feature is counted in `skipped`, NOT in `errors`
- AND no new row is inserted for that feature

#### Scenario: Parent not found — insert with NULL and warning

- GIVEN a feature has no `parent_code` attribute and no existing zone spatially contains it
- WHEN `POST /geo-zones/import?level=canton&auto_parent=true`
- THEN the row is inserted with `parent_id = NULL`
- AND `warnings` includes `"Zone '<name>' imported without parent (no match found)"`

#### Scenario: Entire import DB error rolls back all inserts

- GIVEN 5 valid features are being imported
- WHEN the database raises a constraint violation mid-batch
- THEN response status is 500
- AND zero rows are inserted (full transaction rollback)

---

## Requirement Group 6: Form Data Endpoint + PostGIS Storage

### Requirement R9: GET /geo-zones/form-data

The system MUST expose `GET /geo-zones/form-data` returning:
- `levels`: array of valid level strings (`["cantón","parroquia","provincia","sector"]`)
- `parents`: array of `{ id, name, code, level }` for all active zones, sorted by `level` then `name`

This endpoint MUST require authentication. No specific RBAC permission beyond a valid JWT is required.

#### Scenario: Form data returns all levels and active parent zones

- GIVEN 5 active zones across 3 levels and 1 inactive zone
- WHEN `GET /geo-zones/form-data` is called by an authenticated user
- THEN response status is 200
- AND `levels` contains exactly `["cantón","parroquia","provincia","sector"]`
- AND `parents` contains the 5 active zones sorted by level then name
- AND the inactive zone is excluded

#### Scenario: Unauthenticated request returns 401

- GIVEN no Authorization header
- WHEN `GET /geo-zones/form-data` is called
- THEN response status is 401

#### Scenario: Empty zone table returns empty parents array

- GIVEN no zones exist in `geo_zones`
- WHEN `GET /geo-zones/form-data` is called
- THEN `parents` is `[]`
- AND `levels` still returns the four level strings

### Requirement R10: Polygon Geometry Storage and Map Retrieval

Zone polygons imported via `POST /geo-zones/import` MUST be stored as PostGIS geometry in the `geo_zones.polygon` column (type: `MultiPolygon`, SRID 4326).
The `GET /geo-zones` endpoint MUST return the polygon as GeoJSON when queried for map rendering (via `ST_AsGeoJSON`).
Zones without polygon MUST return `polygon: null`.

#### Scenario: Imported polygon is stored as PostGIS geometry

- GIVEN a valid shapefile feature with a polygon geometry
- WHEN `POST /geo-zones/import` succeeds for that feature
- THEN `SELECT ST_AsGeoJSON(polygon) FROM geo_zones WHERE code = '<code>'` returns valid GeoJSON
- AND `ST_SRID(polygon) = 4326`

#### Scenario: Map endpoint returns GeoJSON polygon for display

- GIVEN a zone with a stored polygon exists
- WHEN `GET /geo-zones?level=canton` is called for map rendering
- THEN each zone in the response includes a `polygon` field with GeoJSON geometry
- AND zones without a polygon return `polygon: null`

#### Scenario: Polygon integrity maintained after import

- GIVEN a feature has a multi-part polygon (island canton)
- WHEN imported and retrieved via `GET /geo-zones`
- THEN the returned GeoJSON preserves all polygon parts
- AND `ST_IsValid(polygon) = true` in the database

---

## Edge Cases Summary

| Edge Case | Requirement | Expected Behavior |
|-----------|-------------|-------------------|
| Duplicate `code` in same import batch | R8 | First occurrence inserted; subsequent occurrences skipped |
| Feature with valid geometry but invalid parent level | R8 | Insert with `parent_id = NULL`; warning emitted |
| Import zip with 0 valid features | R7 | 200 with `{ imported: 0, skipped: 0, errors: [...], warnings: [] }` |
| Zone filter selected with no incidents in zone | R5 | Map shows zero incident markers; no error |
| Polygon click on zone without code | R6 | Detail shows name and type; code field is empty or "—" |
| `GET /geo-zones/form-data` with 1000+ zones | R9 | Response returns all active zones (no pagination cap on form-data endpoint) |
| Shapefile with `name` > 255 chars | R8 | Feature rejected; error entry with truncated display name |

---

## Out of Scope

- Backend `GET /incidents/feed?zone_id=` filter (interim client-side filter only)
- Leaflet.Draw or manual polygon drawing
- `.shp` upload without `.zip` wrapper
- Import rollback / undo batch
- Shapefiles outside Ecuador bounds accepted with override
- GDAL/ogr2ogr server-side conversion
- Multi-file or drag-and-drop upload
