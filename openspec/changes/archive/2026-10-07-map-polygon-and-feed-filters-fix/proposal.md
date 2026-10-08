# Proposal: Fix Map Polygon Reflection and Citizen Feed Filters

**Change**: `front/2026-10-05-map-polygon-and-feed-filters-fix`  
**Scope**: Mixto (`backend` + `frontend`). Backend restaura paridad de filtros en feed ciudadano; frontend resuelve carrera asíncrona de polígonos.  
**Fecha**: 2026-10-05  
**Prioridad**: Alta  
**Estado**: `spec_ready` (pendiente aprobación humana)

---

## Intent

Corregir dos defectos funcionales que impiden el filtrado correcto y la visualización geográfica en la ruta `/app/mapa`:

1. **Polígono de zona no reflejado en el mapa**: Al seleccionar una provincia (o cualquier zona en cascada) en `MapFiltersComponent`, el polígono no se dibuja ni se resalta en el mapa Leaflet, y no se ejecuta el encuadre (`fitBounds`) debido a una condición de carrera asíncrona en la carga del catálogo territorial.
2. **Filtros de incidencias ignorados en el feed ciudadano**: Al seleccionar filtros de "Prioridad" o "Categoría", la lista de incidencias en el mapa no se filtra y sigue devolviendo la totalidad de registros, debido a que el servicio `IncidentFeedService.getCitizenFeed` omitió estos parámetros tanto en su capa de caché Redis como en la consulta fallback de PostgreSQL.

---

## Diagnóstico y Evidencia Técnica

### 1. Carrera asíncrona de capas territoriales (Frontend)
- **Archivo**: `frontend/src/app/features/citizen/map/map.component.ts`
- **Causa raíz**: En `ngAfterViewInit()`, `loadZones()` invoca `geoZoneService.listAll()`, la cual realiza una consulta paginada asíncrona con `expand` y `reduce`. Paralelamente, `MapFiltersComponent` carga únicamente el nivel provincia y habilita el dropdown rápidamente.
- Si el usuario selecciona una provincia antes de que finalice `listAll()`, `highlightZone(filters.zone_id)` es invocado cuando `zoneLayerById` aún se encuentra vacío. Al no existir la capa en el diccionario, la función termina de inmediato sin aplicar estilos ni zoom.
- Cuando la suscripción a `loadZones()` finalmente resuelve, inicializa las capas en su estilo base y resetea `highlightedZoneId = null`, pero **no re-aplica el filtro activo** (`activeFilters.zone_id`).
- Además, si la geometría de alguna zona llega como string JSON sin deserializar, `L.geoJSON()` lanza una excepción no capturada que interrumpe la carga total de capas.

### 2. Paridad incompleta en `IncidentFeedService.getCitizenFeed` (Backend)
- **Archivo**: `backend/src/modules/incidents/incident-feed.service.ts`
- **Causa raíz**: Mientras que `getStaffFeed()` (para roles de operador y admin) evalúa `status`, `priority`, `incident_category_id` y `zone_id`, el método `getCitizenFeed()` (utilizado por ciudadanos y el rol `reporter`) únicamente contemplaba `status` y `zone_id`.
- **Ruta Caché Redis** (líneas 180–188): El arreglo `cached` solo se filtraba con `i.status` e `i.location_id`. Los campos `query.priority` y `query.incident_category_id` eran ignorados por completo.
- **Ruta Fallback PostgreSQL** (líneas 198–212): La consulta SQL solo agregaba cláusulas para `status` y `zone_id`, ignorando `priority` y `incident_category_id`.

---

## Alcance

### In Scope
- **Backend**:
  - Incorporar filtrado por `query.priority` y `query.incident_category_id` en la ruta de caché Redis de `getCitizenFeed`.
  - Incorporar parámetros y cláusulas WHERE (`i.priority = $...` e `i.category_id = $...`) en la consulta fallback PostgreSQL de `getCitizenFeed`.
  - Agregar pruebas unitarias en `incident-feed.service.spec.ts` que validen ambas rutas.
- **Frontend**:
  - Re-aplicar declarativamente `highlightZone(activeFilters.zone_id)` al resolverse la promesa/observable de `loadZones()`.
  - Implementar método defensivo `parsePolygon()` en `MapComponent` capaz de interpretar tanto objetos como cadenas JSON.
  - Asegurar la visibilidad de la capa seleccionada mediante `bringToFront()`.
  - Agregar pruebas unitarias en `map.component.spec.ts` para carga asíncrona diferida y tolerancia a geometrías en string.

### Out of Scope
- Modificaciones al esquema de base de datos o creación de nuevas migraciones (PostGIS y las tablas `incidents` y `geo_zones` ya contienen los campos requeridos).
- Cambios en el árbol de permisos RBAC (los roles ya poseen permiso `READ` para `geo-zones` e `incidents`).
- Modificaciones visuales a los componentes de filtros de escritorio o móviles fuera de la lógica de emisión.

---

## Criterios de Aceptación (DoD)

1. Al seleccionar una provincia en `/app/mapa`, su polígono se visualiza con el estilo de resaltado (grosor 4, color distintivo) y el mapa realiza `fitBounds` hacia sus límites, independientemente del tiempo de respuesta de la red.
2. Al filtrar por "Prioridad" o "Categoría", las incidencias mostradas en `/app/mapa` reflejan únicamente los registros que coinciden con dichos criterios.
3. El reseteo de filtros restaura la totalidad de incidencias y devuelve todas las capas de zonas a su estado visual predeterminado.
4. Cobertura de pruebas unitarias 100% pasando en `incident-feed.service.spec.ts` y `map.component.spec.ts`.
5. Gates verdes en CI: `npm test`, `npm run build`, `pnpm test`, `pnpm run build`.
