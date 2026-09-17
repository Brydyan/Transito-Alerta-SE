# Map Zone Filters Specification

## Purpose

Define the behavioral contract for cascading province/canton/parroquia
dropdowns on the map, zone boundary highlighting, and zone-scoped incident
display.

## Requirements

### Requirement: Cascading Zone Dropdowns

The map filter panel MUST expose three cascading dropdowns: Provincia, Canton,
Parroquia. Each dropdown MUST load from `GET /geo-zones?level=<level>&active=1`.
Canton dropdown MUST be disabled until a Provincia is selected; it MUST load
only zones whose `parent_id` matches the selected Provincia. Parroquia MUST
be disabled until a Canton is selected; it MUST load only zones whose
`parent_id` matches the selected Canton.

#### Scenario: Provincia selection enables Canton dropdown

- GIVEN the map filter panel is open and all three dropdowns are at default (empty)
- WHEN the user selects a Provincia from the first dropdown
- THEN the Canton dropdown becomes enabled
- AND it loads `GET /geo-zones?level=canton&parent_id=<selected_provincia_id>&active=1`
- AND the Parroquia dropdown remains disabled and empty

#### Scenario: Canton selection enables Parroquia dropdown

- GIVEN a Provincia is already selected
- WHEN the user selects a Canton
- THEN the Parroquia dropdown becomes enabled
- AND it loads `GET /geo-zones?level=parroquia&parent_id=<selected_canton_id>&active=1`

#### Scenario: Changing Provincia resets Canton and Parroquia

- GIVEN Provincia A, Canton X, and Parroquia Y are selected
- WHEN the user changes Provincia to Provincia B
- THEN Canton dropdown resets to empty and reloads for Provincia B
- AND Parroquia dropdown resets to empty and is disabled
- AND `onFiltersChange()` emits the updated filter state

#### Scenario: Reset button clears all zone selections

- GIVEN any combination of Provincia/Canton/Parroquia is selected
- WHEN the user clicks the Reset button
- THEN all three dropdowns return to their default (empty) state
- AND Canton and Parroquia dropdowns become disabled again

### Requirement: Zone Boundary Highlight

When a Canton or Parroquia is selected, the map MUST display its boundary
polygon as a distinct highlight layer (red stroke, weight 3) rendered above
other zone layers. When the selection is cleared, the highlight layer MUST
be removed. Only one zone boundary MUST be highlighted at a time.

#### Scenario: Zone boundary rendered on selection

- GIVEN no zone is currently highlighted
- WHEN the user selects Canton "Santa Elena" (which has a polygon)
- THEN the map renders a red polygon boundary for that canton
- AND calls `map.fitBounds()` so the zone fills the viewport

#### Scenario: Previous highlight removed on new selection

- GIVEN Canton "Santa Elena" is highlighted
- WHEN the user selects a different Canton "La Libertad"
- THEN the "Santa Elena" boundary layer is removed
- AND the "La Libertad" boundary is rendered and `fitBounds()` is called

#### Scenario: Zone without polygon — no highlight, no crash

- GIVEN a canton has `polygon = NULL`
- WHEN the user selects that canton
- THEN no boundary layer is rendered
- AND the map does not throw an error or crash

### Requirement: Zone-Scoped Incident Display

When a zone is selected (Canton or Parroquia level), the map MUST display
only incident markers whose coordinates fall within that zone's boundary.
This filter MUST be applied client-side. When the zone filter is cleared,
all incidents in the current map viewport MUST be displayed again.

#### Scenario: Incidents outside selected zone hidden

- GIVEN 10 incident markers are visible on the map
- WHEN the user selects Canton "Santa Elena"
- THEN only incidents whose coordinates are inside the Canton boundary are shown
- AND the remaining incidents are hidden (not removed from state)

#### Scenario: Clearing zone selection restores all incidents

- GIVEN Canton "Santa Elena" is selected and 3 of 10 incidents are visible
- WHEN the user clears the zone selection (resets filters)
- THEN all 10 incidents become visible again

### Requirement: Zone Filter Integration with Filter State

The map filter state (`MapActiveFilters`) MUST include a `zone_id` field.
`onFiltersChange()` MUST emit the updated state whenever any zone dropdown
changes. All existing filters (status, priority, category) MUST continue to
work alongside zone filters without interference.

#### Scenario: Zone filter emitted alongside existing filters

- GIVEN status filter "activo" and Categoria "Baches" are active
- WHEN the user selects Canton "La Libertad" (id = 42)
- THEN `onFiltersChange()` emits `{ status: 'activo', category: 'Baches', zone_id: 42 }`

### Requirement: Zone Polygons Rendered by Level Color

The map MUST render boundary polygons for all active zones with non-null polygon.
Each zone level MUST use a distinct stroke color: cantones, parroquias, provincias, sectores each get one fixed color.
Fill MUST be semi-transparent (opacity ≤ 0.2). Polygon layers MUST NOT capture pointer events (so incident markers beneath remain clickable).

#### Scenario: All four levels render with distinct colors on load

- GIVEN active zones exist at all four levels with non-null polygon
- WHEN the map initializes
- THEN four distinct stroke colors are visible on the map, one per level
- AND incident markers below zone polygons are still clickable

#### Scenario: Zone without polygon is silently skipped

- GIVEN a zone has `polygon = NULL`
- WHEN the map renders zone layers
- THEN no layer is added for that zone and no error is thrown

### Requirement: Polygon Click Shows Zone Details

Clicking on a zone polygon boundary MUST show a details panel or tooltip with:
zone name, code, level (type), and parent name (or "—" if none).
The detail data MUST be embedded in the polygon layer metadata — no additional API request is required.

#### Scenario: Click on polygon displays name, code, level, and parent

- GIVEN polygon layers are rendered with embedded metadata
- WHEN the user clicks a cantón polygon
- THEN a tooltip/panel displays the zone's name, code, type ("cantón"), and parent name
- AND no HTTP request is fired

#### Scenario: Click on polygon for zone with no parent

- GIVEN a provincia polygon has no parent
- WHEN the user clicks it
- THEN the detail shows name, code, type="provincia" and parent field is "—"

#### Scenario: Click on zone with no code

- GIVEN a zone has `code = NULL` and a valid polygon
- WHEN the user clicks its polygon
- THEN the detail shows name and type; code field displays "—" without error
