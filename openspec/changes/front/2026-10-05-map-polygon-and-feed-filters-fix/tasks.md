# Tasks: Fix Map Polygon Reflection and Citizen Feed Filters

**Change**: `front/2026-10-05-map-polygon-and-feed-filters-fix`  
**Estado**: `spec_ready` (pendiente aprobación humana)

---

## Phase 1: Backend — Paridad de Filtros en Feed Ciudadano

- [ ] **Task 1.1**: Agregar filtrado por `priority` y por `incident_category_id` en la rama de caché Redis de `IncidentFeedService.getCitizenFeed`.
  - *Archivo*: `backend/src/modules/incidents/incident-feed.service.ts`
  - *Detalle*: Filtrar el arreglo `items` recuperado de la clave `feed:incidents` evaluando `query.priority` y `query.incident_category_id`.

- [ ] **Task 1.2**: Agregar condiciones SQL dinámicas para `priority` y categoría en la rama fallback PostgreSQL de `IncidentFeedService.getCitizenFeed`.
  - *Archivo*: `backend/src/modules/incidents/incident-feed.service.ts`
  - *Detalle*: Agregar parámetros y cláusulas `i.priority = $...` e `i.category_id = $...` a `conditions` antes de la paginación.

- [ ] **Task 1.3**: Agregar pruebas unitarias en `incident-feed.service.spec.ts` validando el comportamiento en ambas ramas.
  - *Archivo*: `backend/src/modules/incidents/incident-feed.service.spec.ts`
  - *Detalle*: Probar filtrado en memoria sobre datos cacheados y verificar que la consulta SQL generada incluya las cláusulas esperadas en caso de cache miss.

---

## Phase 2: Frontend — Resaltado Reactivo de Polígonos en Mapa

- [ ] **Task 2.1**: Implementar método defensivo `parsePolygon()` en `MapComponent`.
  - *Archivo*: `frontend/src/app/features/citizen/map/map.component.ts`
  - *Detalle*: Manejar de forma segura `zone.polygon` tanto si es un objeto GeoJSON como si llega serializado en formato string, retornando `null` ante cadenas inválidas.

- [ ] **Task 2.2**: Re-aplicar declarativamente `highlightZone()` al completar la carga asíncrona de zonas territoriales.
  - *Archivo*: `frontend/src/app/features/citizen/map/map.component.ts`
  - *Detalle*: En el bloque `next` de `loadZones()`, verificar si `this.activeFilters.zone_id` está definido y llamar a `this.highlightZone(this.activeFilters.zone_id)`.

- [ ] **Task 2.3**: Asegurar elevación visual del polígono activo con `bringToFront()`.
  - *Archivo*: `frontend/src/app/features/citizen/map/map.component.ts`
  - *Detalle*: Invocar `bringToFront()` en la capa seleccionada dentro de `highlightZone()` para que permanezca visible sobre cualquier elemento circundante.

- [ ] **Task 2.4**: Agregar pruebas unitarias en `map.component.spec.ts`.
  - *Archivo*: `frontend/src/app/features/citizen/map/map.component.spec.ts`
  - *Detalle*: Testear la tolerancia a polígonos GeoJSON en string y verificar que `highlightZone` sea ejecutado cuando `loadZones` resuelve de forma asíncrona tras un cambio de filtro previo.

---

## Phase 3: Verificación y CI Gates

- [ ] **Task 3.1**: Validar suite completa y build en backend.
  - *Comandos*: `npm test` y `npm run build` en `backend/`.
  - *Criterio*: 123/123 suites pasando y compilación exitosa (exit code 0).

- [ ] **Task 3.2**: Validar suite completa y build en frontend.
  - *Comandos*: `pnpm test` y `pnpm run build` en `frontend/`.
  - *Criterio*: 104/104 suites pasando y compilación de producción exitosa (exit code 0).
