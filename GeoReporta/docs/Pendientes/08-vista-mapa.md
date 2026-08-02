# 08 — Vista de mapa georreferenciado

**Tipo:** Feature (central para el producto)
**Severidad:** 🟠 Media-Alta (es el feature que da sentido al nombre "georreferenciadas")
**Backend:** ✅ Datos disponibles (PostGIS + `geom` + GeoJSON) · **Frontend:** ⚠️ Solo captura (form), falta vista de lista
**Estado:** ❌ No implementado

## Problema

El sistema se llama "Incidencias **Georreferenciadas**" pero hoy no hay forma de **ver** las incidencias en un mapa. La única presencia de Leaflet es para **capturar** coordenadas al crear/editar (un punto seleccionado manualmente). Faltan los casos de uso centrales:

- Ver todas las incidencias en un mapa (con filtros).
- Para el operador: dispatch visual, "¿qué tengo cerca?".
- Para el ciudadano: panorama de su zona.
- Para el publicador/admin: vista táctica con clustering y filtros por organización/estado/categoría.

Sin esto, el sistema es una lista plana de tickets. La "georreferenciación" queda como un atributo guardado en BD que nadie ve.

## Estado actual

**Lo que YA está listo (no hay que construirlo):**

- ✅ `incidents.geom` (Point, PostGIS, SRID 4326) — columna en BD, escribible en create/update.
- ✅ `locations.geom` (Point, PostGIS) — opcional, sobre la jerarquía País→Provincia→Ciudad.
- ✅ `IncidentResource` ya expone `geom` como GeoJSON (`backend/app/Domains/Incidents/Http/Resources/IncidentResource.php:30`).
- ✅ `RedisIncidentSync` listener guarda `geom` como GeoJSON en el payload de sync (mencionado en [`02-rutas-fantasma.md`](./02-rutas-fantasma.md)).
- ✅ `frontend/app/shared/leaflet.js` — lazy loader de Leaflet 1.9.4 desde CDN. Cachea la promesa para que el primer load lo paguen los form y los siguientes componentes lo reutilicen.
- ✅ `frontend/app/incidencias/pages/form/incidencias.form.component.js` — usa Leaflet en modo "captura": click en el mapa setea `geom`, drag del marker actualiza, devuelve `GeoJSON Point` al form. Centro por defecto: Machala, Ecuador (lat -0.9537, lng -80.7286, zoom 13).
- ✅ Mencionado en `leaflet.js:6`: "Used by feed-create, feed-detail, and the classic form." → el patrón ya está copiado en otros lados.

**Lo que NO está (es lo que este doc propone construir):**

- ❌ Componente de mapa que muestre **N** marcadores (lista de incidencias, no solo una).
- ❌ Clustering para cuando hay muchas incidencias en la misma zona.
- ❌ Filtros visuales sobre el mapa (por estado, categoría, organización, rango de fechas).
- ❌ Popup/preview al hacer click en un marcador.
- ❌ Ruta `/mapa` (admin) y/o `/incidencias/mapa` (operator/citizen) registrada en `app.js`.
- ❌ Servicio frontend dedicado (`map.service.js` o similar) que consulte el backend con los filtros aplicados.

## Alcance

### Backend (mínimo, casi todo ya está)

- [ ] **Confirmar endpoint** que devuelve lista paginada de incidencias con `geom` ya expuesto. Hoy `GET /api/incidents` lo hace vía `IncidentResource`, pero hay que verificar:
  - Que el payload es razonable para el mapa (no trae comentarios ni historial — solo lo necesario para renderizar el marker + popup).
  - Que el `geom` se serializa como GeoJSON Point, no como WKT.
  - Que respeta el scope multitenant (SystemAdmin ve todo; OperadorOrg/Publicador solo su org).
- [ ] **Filtros geoespaciales opcionales** (no necesarios para v1 del mapa, pero dejarlos pensados):
  - `bbox` (bounding box): `?bbox=lat_min,lng_min,lat_max,lng_max` para mostrar solo lo que está en el viewport actual del cliente.
  - `near` (radio): `?lat=X&lng=Y&radius_m=Z` para "incidencias cerca de mí".
- [ ] **Rate limiting** en el endpoint si se va a refrescar con cada pan/zoom. Considerar ETag o `Cache-Control: max-age=N` por scope.

### Frontend (la mayor parte del trabajo)

- [ ] **Componente `mapa.component.js`** reutilizable. Decidir si se monta una sola vez en el shell (con watch sobre la ruta actual) o se carga por ruta. Sugerencia: componente cargado lazy en la ruta, no en el shell.
- [ ] **Servicio `mapa.service.js`** que:
  - Recibe la lista de filtros del estado.
  - Llama a `GET /api/incidents` con esos filtros + paginación.
  - Cachea resultados en memoria por (filtros, página) para no re-pegar al backend en cada pan.
  - Se suscribe al `RedisIncidentSync` (vía SSE o WebSocket) para refrescar marcadores en tiempo real cuando llega un update.
- [ ] **Clustering** usando `leaflet.markercluster` (o similar). Decidir threshold (e.g. mostrar cluster cuando hay > 10 markers en el viewport).
- [ ] **Popup por marker** con: título, badge de estado, prioridad, fecha, link "ver detalle".
- [ ] **Filtros en panel lateral** o top-bar del mapa: estado, prioridad, categoría, rango de fechas, organización (solo SystemAdmin).
- [ ] **Fit bounds** automático al cargar: si hay resultados, ajustar el viewport para que entren todos; si no hay, mantener centro por defecto.
- [ ] **Selector de capa base** (opcional v1): OpenStreetMap por default, posibilidad de agregar capa satelital.

### Rutas (frontend)

- [ ] Decidir **una** de estas opciones (no ambas en v1):
  - **A)** `/mapa` (admin) — vista de mapa para el shell admin, multitenant-aware con todos los filtros.
  - **B)** `/incidencias/mapa` (operator) — vista para el shell operator con scope de la propia org.
  - **C)** `/mapa-ciudadano` (citizen) — vista pública/semi-pública, sin scope o con scope por ubicación del usuario.
- [ ] Registrar la ruta elegida en `app.js` con los guards correctos (`authGuard` para A/B; sin guard o `roleGuard` para C si es pública).
- [ ] Registrar el ítem en el menú dinámico (seed de `menus`) para que aparezca automáticamente al usuario que tenga permiso.

### Reutilización del form

- [ ] Extraer la lógica de "init Leaflet map" del `incidencias.form.component.js` a una función compartida (`initMapView(container, options)`) para no duplicar código entre captura y vista de lista.
- [ ] Definir contrato de opciones: `{ center, zoom, mode: 'capture' | 'list', markers?, onSelect? }`.

## Decisiones previas requeridas

1. **Leaflet vs MapLibre vs Mapbox.**
   - Leaflet ya está integrado y es OSS. ✅ Recomendado seguir con Leaflet.
   - MapLibre (fork OSS de Mapbox GL) da tiles vectoriales más fluidos pero requiere setup adicional.
   - Mapbox requiere API key y es pago.

2. **¿Clustering en v1?**
   - Si se espera < 100 incidencias activas: no hace falta en MVP.
   - Si se espera > 500: obligatorio. Marcar como Nice-to-have v1, requerido v2.

3. **¿Heatmap?**
   - Útil para identificar zonas críticas, pero puede ser confuso si hay pocas incidencias.
   - Sugerencia: feature v2, después de validar uso del mapa base.

4. **¿Tiempo real con Redis sync?**
   - Hoy `RedisIncidentSync` publica eventos. Falta el transporte: SSE (`/api/incidents/stream`) o WebSocket.
   - Si se hace en v1, requiere también backend. Si no, refresh manual con botón o cada 30s.

5. **¿Ciudadano ve el mapa?**
   - Si sí: ¿público o autenticado? Si autenticado, ¿qué scope (todas las públicas? las de su zona? las de su org)?
   - Si no: el mapa es solo para admin/operator/publicador.

6. **Performance de la lista:**
   - ¿Carga inicial completa y filtros en cliente, o filtros en backend con re-fetch?
   - Para < 1000 incidencias: cliente es OK. Para más: backend con paginación + viewport-based fetch.

## Criterios de aceptación

- [ ] Existe la ruta `/mapa` (o la equivalente decidida) y al navegar se ve un mapa centrado en Ecuador con marcadores de las incidencias existentes.
- [ ] Cada marcador muestra un popup con: título, estado (badge de color), prioridad, fecha de creación, link al detalle.
- [ ] Los filtros (estado, prioridad, categoría) actualizan la lista de marcadores sin recargar la página.
- [ ] El scope multitenant se respeta: un OperadorOrg solo ve las incidencias de su organización en el mapa.
- [ ] Al hacer pan/zoom, los marcadores se actualizan (vía filtro `bbox` o clustering) sin recargar la página completa.
- [ ] El componente `mapa.component.js` reutiliza la inicialización de Leaflet del `leaflet.js` compartido (no duplica el lazy loader).
- [ ] Si una incidencia no tiene `geom` (campo opcional), no aparece en el mapa pero sí en la lista tabular (no se rompe).
- [ ] La performance es aceptable: el primer render con 100 marcadores tarda < 2s en una laptop normal.

## Archivos afectados

**Nuevos:**
- `frontend/app/mapa/mapa.component.{js,html,css}` (o `frontend/app/incidencias/pages/mapa/...`)
- `frontend/app/shared/mapa.service.js`
- `backend/app/Domains/Incidents/Http/Requests/MapBoundsRequest.php` (si se implementa filtro `bbox`)

**Modificados:**
- `frontend/app/app.js` — nueva ruta
- `frontend/app/shared/leaflet.js` — exponer `initMapView()` o similar
- `frontend/app/incidencias/pages/form/incidencias.form.component.js` — usar el `initMapView` extraído
- `backend/database/seeders/MenuSeeder.php` — agregar ítem de menú `/mapa`
- `backend/app/Domains/Incidents/Http/Resources/IncidentResource.php` — quizás agregar campo `summary` reducido para el popup
- `docs/Requisitos/SRS.md` — agregar RF-FUNC-036 "Vista de mapa georreferenciado" cuando se implemente

**Referencia (no modificar, solo reutilizar):**
- `frontend/app/shared/leaflet.js`
- `frontend/app/incidencias/pages/form/incidencias.form.component.js` (como ejemplo de init)
- `backend/app/Domains/Incidents/Listeners/RedisIncidentSync/RedisIncidentSync.php`

## Referencias

- [00-INDEX.md](./00-INDEX.md) — backlog cerrado, este es el único pendiente genuino al 07/07/2026
- [02-rutas-fantasma.md](./02-rutas-fantasma.md) — la primera mención de `/mapa` como ruta faltante
- [docs/Requisitos/SRS.md](../Requisitos/SRS.md) — el SRS v2.0; agregar RF-FUNC-036 cuando se implemente
- RF relacionados en SRS v2.0: `RF-FUNC-001` (crear incidencia con `geom`), `RF-FUNC-015` (selección de ubicación), `RF-FUNC-016` (PostGIS)

## Estimación rough

Si se opta por v1 mínimo (Leaflet + lista + filtros + scope + popup, sin clustering ni tiempo real):

- Backend: 0.5 día (verificar endpoint, agregar `bbox` opcional)
- Frontend: 1.5-2 días (componente, servicio, integración con menu dinámico)
- Tests: 0.5 día (snapshot del mapa con mocks, integración con backend)
- **Total: ~3 días de desarrollo + 1 día de pulido visual**

Con clustering y tiempo real: +1-2 días.
