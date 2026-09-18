# Geo-Zones Import Specification

## Purpose

Define the behavioral contract for bulk-importing administrative boundary zones
from a shapefile `.zip` via `POST /geo-zones/import`.

## Requirements

### Requirement: Shapefile Upload Endpoint

The system MUST expose `POST /geo-zones/import` accepting `multipart/form-data`
with a `file` field. Callers MUST hold the `CREATE geo-zones` permission.
File MUST be a `.zip` archive containing at minimum `.shp`, `.shx`, and `.dbf`
members. Maximum file size is 10 MB; the request MUST be rejected before
parsing if this limit is exceeded.

#### Scenario: Valid zip imported successfully

- GIVEN a caller with `CREATE geo-zones` permission
- WHEN `POST /geo-zones/import` receives a valid `.zip` (< 10 MB, 3 canton features)
  with query `?level=canton&auto_parent=true`
- THEN the response status is 200
- AND the body is `{ imported: 3, skipped: 0, errors: [], warnings: [] }`
- AND 3 new rows exist in `geo_zones` with `level = 'canton'`

#### Scenario: File size exceeds 10 MB

- GIVEN a caller with `CREATE geo-zones` permission
- WHEN `POST /geo-zones/import` receives a `.zip` file larger than 10 MB
- THEN the response status is 400
- AND no rows are inserted

#### Scenario: Missing or wrong file format

- GIVEN a caller with `CREATE geo-zones` permission
- WHEN `POST /geo-zones/import` receives a `.pdf` or a `.zip` missing `.shp`
- THEN the response status is 400
- AND the error message indicates unsupported format

#### Scenario: Missing permission returns 403

- GIVEN a caller WITHOUT `CREATE geo-zones` permission
- WHEN `POST /geo-zones/import` is called
- THEN the response status is 403

### Requirement: Per-Feature Validation

The system MUST validate each parsed feature individually. Features failing
validation MUST be recorded in the `errors` array and skipped; they MUST NOT
cause the entire import to fail. A feature MUST be rejected when:
- geometry is invalid (`ST_IsValid = false`)
- geometry bounds fall outside Ecuador (> 500 km from Ecuador centroid)
- `name` attribute is empty or exceeds 255 characters
- `code` attribute (if present) exceeds 32 characters

#### Scenario: Invalid geometry skipped with error entry

- GIVEN a zip with 5 features, feature index 2 has a self-intersecting polygon
- WHEN `POST /geo-zones/import?level=parroquia` is called
- THEN the response is `{ imported: 4, skipped: 0, errors: [{ index: 2, name: "...", reason: "Invalid geometry" }], warnings: [] }`
- AND 4 rows are created; no row for feature 2

#### Scenario: Geometry outside Ecuador bounds rejected

- GIVEN a zip with a feature whose centroid is in Peru
- WHEN `POST /geo-zones/import?level=canton` is called
- THEN that feature appears in `errors` with reason `"Geometry outside Ecuador bounds"`
- AND it is not inserted

### Requirement: Duplicate Handling

The system MUST skip features whose `code` already exists in `geo_zones`
(partial UNIQUE index from migration 0035). Skipped duplicates MUST increment
`skipped` in the response and MUST NOT appear in `errors`.

#### Scenario: Duplicate code skipped without error

- GIVEN `geo_zones` already contains a row with `code = 'EC-09'`
- WHEN a zip feature has `code = 'EC-09'`
- THEN the feature is skipped
- AND the response reflects `skipped: 1` and no error entry for that feature

### Requirement: Parent Resolution

When `auto_parent=true`, the system SHOULD attempt to resolve `parent_id` for
each feature by:
1. Matching the `parent_code` attribute (if present) against existing `geo_zones.code`
2. Falling back to spatial containment (`ST_Contains`) against active zones at
   the parent level

If no parent is found, the row MUST be inserted with `parent_id = NULL` and a
warning MUST be added to the `warnings` array. When `auto_parent=false` or
omitted, `parent_id` is always NULL.

#### Scenario: Parent resolved by code attribute

- GIVEN zone `EC-01` (province) exists and a feature has `parent_code = 'EC-01'`
- WHEN `POST /geo-zones/import?level=canton&auto_parent=true`
- THEN the new row has `parent_id` pointing to zone `EC-01`
- AND no warning for that feature

#### Scenario: Parent resolved by spatial containment

- GIVEN province polygon P covers feature F; F has no `parent_code` attribute
- WHEN `POST /geo-zones/import?level=canton&auto_parent=true`
- THEN the new row has `parent_id` = P.id

#### Scenario: Parent not found — insert with NULL and warning

- GIVEN feature F has no `parent_code` and no existing zone contains it spatially
- WHEN `POST /geo-zones/import?level=canton&auto_parent=true`
- THEN the row is inserted with `parent_id = NULL`
- AND `warnings` includes `"Zone '<name>' imported without parent (no match found)"`

### Requirement: Atomic Transaction

The entire import MUST execute inside a single database transaction. If the
transaction fails (e.g., unexpected DB error), zero rows MUST be inserted and
the response MUST return 500.

#### Scenario: DB error rolls back all inserts

- GIVEN 5 valid features to import
- WHEN the DB raises a constraint violation mid-batch
- THEN the response status is 500
- AND zero rows are inserted (full rollback)

### Requirement: Import Response Envelope

The 200 response MUST conform to:

```
{
  imported: number,
  skipped:  number,
  errors:   Array<{ index: number, name: string, reason: string }>,
  warnings: string[]
}
```

`imported` counts rows created. `skipped` counts duplicates bypassed.
`errors` lists per-feature failures. `warnings` lists non-fatal notices
(e.g., parent not found).

### Requirement: Duplicate Within Same Batch

When two features in the same import batch share the same `code`, the first
occurrence MUST be inserted (or skipped if it already exists in DB); all
subsequent occurrences with that code MUST be skipped and counted in `skipped`.
No error entry is generated for intra-batch duplicates.

#### Scenario: Two features with same code in one batch

- GIVEN a zip with feature A (`code = 'X-01'`) and feature B (`code = 'X-01'`)
- AND no existing row with `code = 'X-01'` in the database
- WHEN `POST /geo-zones/import` processes the batch
- THEN feature A is inserted
- AND feature B is counted as `skipped: 1` with no error entry
- AND `imported: 1`

### Requirement: Zero Valid Features Import

When all features in a batch fail validation or are duplicates, the endpoint
MUST still return 200 with `imported: 0`. An empty import MUST NOT return 4xx.

#### Scenario: All features invalid returns 200 with zero imported

- GIVEN a zip where every feature has an invalid geometry
- WHEN `POST /geo-zones/import?level=canton` is called
- THEN response status is 200
- AND body is `{ imported: 0, skipped: 0, errors: [...all features...], warnings: [] }`
