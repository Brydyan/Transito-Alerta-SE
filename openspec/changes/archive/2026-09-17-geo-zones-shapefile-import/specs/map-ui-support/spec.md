# Delta for Map UI Support

## ADDED Requirements

### Requirement: GET /geo-zones Supports level and parent_id Query Params

The `GET /geo-zones` endpoint MUST accept optional `level` and `parent_id`
query parameters. When `level` is provided, only zones matching that level
MUST be returned. When `parent_id` is provided, only zones whose `parent_id`
matches MUST be returned. Both filters MAY be combined. The `active` query
parameter (already supported) MUST continue to work alongside these new params.

#### Scenario: Filter by level returns matching zones only

- GIVEN zones exist at levels province, canton, and parroquia
- WHEN `GET /geo-zones?level=canton&active=1` is called
- THEN the response includes only canton-level zones
- AND province and parroquia zones are excluded

#### Scenario: Filter by parent_id returns children only

- GIVEN province P (id=10) has 3 cantons as direct children
- WHEN `GET /geo-zones?level=canton&parent_id=10&active=1` is called
- THEN only the 3 canton children of P are returned

#### Scenario: Missing parent_id param returns all zones at that level

- GIVEN no parent_id is provided
- WHEN `GET /geo-zones?level=parroquia&active=1` is called
- THEN all active parroquia zones are returned regardless of parent

### Requirement: MapActiveFilters Includes zone_id

The frontend `MapActiveFilters` interface MUST include a `zone_id` field
(type: `number | null`). Existing fields (`status`, `priority`, `category`)
MUST remain unchanged. The `zone_id` field MUST default to `null` on filter
initialization and reset.

#### Scenario: zone_id defaults to null on initialization

- GIVEN the map component initializes its filter state
- WHEN `MapActiveFilters` is instantiated
- THEN `zone_id` is `null`
- AND all existing filter fields retain their existing default values

### Requirement: GET /geo-zones/form-data Endpoint

The system MUST expose `GET /geo-zones/form-data` returning:
- `levels`: `["cantón","parroquia","provincia","sector"]`
- `parents`: all active zones as `{ id, name, code, level }` sorted by level then name

Authentication (JWT) is required. No additional RBAC permission is required.
This endpoint supplies dropdown data to the location-form Padre selector and Nivel dropdown.

#### Scenario: Returns all levels and active parents

- GIVEN 5 active zones and 1 inactive zone exist
- WHEN `GET /geo-zones/form-data` is called by an authenticated user
- THEN response status is 200
- AND `levels` = `["cantón","parroquia","provincia","sector"]`
- AND `parents` contains only the 5 active zones, sorted by level then name

#### Scenario: Unauthenticated request returns 401

- GIVEN no Authorization header
- WHEN `GET /geo-zones/form-data` is called
- THEN response status is 401

#### Scenario: Empty geo_zones table returns empty parents

- GIVEN no zones exist
- WHEN `GET /geo-zones/form-data` is called
- THEN `parents` is `[]` and `levels` still returns all four strings
