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

### Requirement: Resaltado Reactivo de Polígonos tras Carga Asíncrona

El mapa DEBE garantizar que si el usuario selecciona una zona geográfica (provincia, cantón, parroquia)
mientras el catálogo de zonas está en proceso de carga por la red, el polígono correspondiente
se resalte automáticamente y se encuadre el mapa (`fitBounds`) en cuanto la respuesta del catálogo llegue,
sin requerir que el usuario vuelva a interactuar con el control de selección.

#### Scenario: Selección de provincia mientras el catálogo de zonas está en vuelo

- GIVEN el usuario navega a `/app/mapa` y la petición `geoZoneService.listAll()` está pendiente de respuesta
- WHEN el usuario abre el panel de filtros y selecciona la provincia "Santa Elena (Provincia)"
- THEN el filtro activo almacena el `zone_id` de la provincia
- AND cuando `loadZones()` completa la carga de polígonos, el mapa automáticamente aplica el estilo de resaltado a la provincia
- AND ejecuta `map.fitBounds()` centrando la vista en la geometría provincial
- AND oculta los polígonos de zonas no seleccionadas (*drill-down*).

#### Scenario: Tolerancia a geometrías GeoJSON en formato string

- GIVEN el catálogo de zonas contiene una zona activa con `polygon` devuelto como cadena JSON
- WHEN el componente genera las capas Leaflet mediante `renderZonePolygons()`
- THEN la geometría es interpretada y deserializada defensivamente sin arrojar excepciones no controladas
- AND la capa es registrada exitosamente en `zoneLayerById`.

#### Scenario: Superposición visual del polígono activo

- GIVEN una zona ha sido seleccionada en los filtros
- WHEN se aplica el estilo de resaltado en `highlightZone()`
- THEN la capa correspondiente invoca `bringToFront()` para garantizar su visibilidad por encima de marcadores o capas base.

### Requirement: Paridad Completa de Filtros en Feed Ciudadano

El servicio `IncidentFeedService.getCitizenFeed` DEBE filtrar las incidencias
aplicando de forma estricta los parámetros `priority` e `incident_category_id`,
tanto cuando los datos se recuperan desde la memoria caché de Redis (`feed:incidents`)
como cuando se consulta directamente la base de datos PostgreSQL como fallback.

#### Scenario: Filtrado por prioridad en caché de Redis

- GIVEN existen incidencias almacenadas en la clave de caché `feed:incidents` con diversas prioridades (`low`, `medium`, `high`, `critical`)
- WHEN un usuario ciudadano solicita el feed con `priority = 'high'`
- THEN el servicio devuelve únicamente las incidencias cuya prioridad sea exactamente `'high'`
- AND el metadato de paginación (`total`, `last_page`) refleja el conteo de los registros filtrados.

#### Scenario: Filtrado por categoría de incidencia en caché de Redis

- GIVEN existen incidencias almacenadas en la caché de Redis asociadas a distintas categorías
- WHEN un usuario ciudadano solicita el feed con un `incident_category_id` específico
- THEN el servicio devuelve únicamente las incidencias cuyo `incident_category_id` coincida con el solicitado.

#### Scenario: Filtrado combinado en fallback de PostgreSQL

- GIVEN la clave de caché en Redis no se encuentra disponible (cache miss)
- WHEN se realiza una petición con `priority = 'critical'`, `incident_category_id = 'cat-1'` y `zone_id = 'prov-1'`
- THEN la consulta SQL ejecutada en PostgreSQL incluye las cláusulas `i.priority = $...`, `i.category_id = $...` y la resolución jerárquica de `i.zone_id IN (...)`
- AND se excluyen registros con `deleted_at IS NOT NULL`.
