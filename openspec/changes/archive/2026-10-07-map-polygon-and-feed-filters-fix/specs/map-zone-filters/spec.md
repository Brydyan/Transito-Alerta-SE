# Specification: Map Zone Filters & Citizen Feed Parity

## Purpose

Definir los requisitos de comportamiento para la correcta visualización y resaltado
reactivo de polígonos territoriales en el mapa Leaflet tras cargas asíncronas,
así como la paridad estricta en el filtrado de incidencias por prioridad y categoría
en el feed ciudadano (`getCitizenFeed`).

---

## Requirements

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

---

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
