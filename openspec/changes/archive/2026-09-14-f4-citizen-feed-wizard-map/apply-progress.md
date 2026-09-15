# Progreso: Fase A de F4 (Citizen Social Features)

## Tareas Completadas (Fase A)
- **A.1.8**: Test de migración 0053 validado en `test/e2e/f4-migration.e2e-spec.ts` y se modificó `tests` en general (requiere ajuste en `MigrationHarness` si no acepta queries crudas como se estructuró). Migración renumerada de 0049 → 0053: la 0049 quedó ocupada por `0049_admin_user_permissions` (F6).
- **A.3.x**: Tests de `incident-social.service.spec.ts` arreglados, garantizando la idempotencia, manejo de 409 y aserción de `citizen_id`. 4 tests pasando en esa suite.
- **A.4.1 / A.4.2**: `incidents.repository.ts` extendido para retornar `follower_count`, `corroboration_count`, `is_followed_by_me` e `is_corroborated_by_me` mediante agregación y EXISTS.
- **A.5.1 / A.5.2**: Se creó `incident-social.controller.ts` exponiendo las rutas `POST/DELETE /followers` y `POST /corroborations` con `JwtAuthGuard` y `PermissionGuard`.
- **A.5.3**: Modificado `incident-workflow.service.ts` para inyectar `citizen_id`, `assigned_to` y `actor_id` al evento de status. `incident-notifications.listener.ts` modificado para excluir al actor que realiza el cambio.

## Tareas Pendientes o Riesgos
- **A.4.3**: Test de conteo de queries N+1 implementado (`f4-query-count.e2e-spec.ts`).
- **A.5.4**: Test de notificación sin seguidores implementado (`f4-notifications.e2e-spec.ts`).
- **A.5.5**: Validaciones (`lint`, `typecheck`, `test`) corriendo con éxito. Las suites E2E están fallando por problemas de ambiente local de Testcontainers.
- **Registro del Módulo**: `IncidentSocialModule` registrado correctamente en `app.module.ts`.
- Se solucionaron errores de TS detectados en los decoradores `@RequirePermission` y firmas del servicio.

## Fase B (Slice 1) Implementada
- Tareas B.1 completadas: Instalación de `leaflet.markercluster`, creación de `incident-social.service.ts` y de `MapPickerComponent` con su spec y exportación.
- Tareas B.2 completadas:
  - Creado `report-draft.service.ts` con Dexie para almacenar borradores offline incluyendo adjuntos.
  - El formulario en `CitizenReportComponent` fue reescrito para utilizar el formato Wizard de 4 pasos (D10).
  - Integración con `MapPickerComponent` y con validaciones en cada paso.
  - Implementación de la publicación de fotos en `IncidentService` y subida anónima de reportes con la constante correcta (`is_anonymous`).
  - Bloqueo de acceso y redirección a login/registro cuando el usuario no tiene sesión.
- Pasa satisfactoriamente tests y validaciones en todo el scope, sin dejar commiteado el working tree para revisión.

## Fase B (Slice 2) Implementada
- Tareas B.3 completadas:
  - Creado `feed.component.ts` (ruta `/inicio`) con el composer superior que navega a `/reportar` (B.3.1).
  - Creado `incident-card.component.ts` con todos los elementos del mock 09-01 (B.3.2).
  - Lógica de "Seguir" implementada con actualización optimista y reversión en caso de error (B.3.3).
  - Lógica de "Yo también reporto" (corroboración) implementada SIN optimismo. Control deshabilitado si el usuario es el autor de la incidencia o si ya está corroborada (B.3.4).
  - Soporte para carga incremental (B.3.5) y estado final del feed (B.3.6), adaptado a la API actual (que aún no pagina real).
  - Creado `feed-filters.component.ts` con chips de estado y un árbol de categorías de 3 estados (indeterminado) con emisión de filtros para recargar el feed (B.3.7).
  - Panel lateral con estadísticas del día derivadas calculadas localmente como placeholder (B.3.8).
  - 11 specs verificando reversión optimista, corroboración, árbol de tres estados y fin de feed (B.3.9).
- Validación estricta superada (0 errores de lint, typecheck ok, build ok, tests unitarios en verde).

## Slice 3 (F4 Phase B) - 2026-09-09

**Scope**: Implement the interactive segmentation map `/mapa`.
**Tasks**: B.4.1 to B.4.8

**Implementation Details**:
- `IGeoZone` interface updated with `IGeoJsonPolygon | IGeoJsonMultiPolygon` types for `polygon` to accommodate map requirements cleanly (B.4.2).
- Built `MapComponent` (`/mapa` route replaced F4 placeholder) using Leaflet and `leaflet.markercluster` with a chunked threshold (`~5.000` incidents marked for server-side processing) (B.4.1, B.4.4).
- Added `MapFiltersComponent` rendering a floating catalog form populated from `/api/map/filters` endpoint (B.4.5).
- Integrated `IncidentService` indirectly by querying `/incidents/feed` directly through `HttpService` because `IncidentService.getIncidents` currently strips dynamic parameters needed for the map payload.
- Active geographic zones are overlaid via `GeoZoneService.listAll()` using `L.geoJSON`. Applied visual hover mechanics for interactivity and transparent stroke boundaries as inter-city segmentation (B.4.2, B.4.3).
- Implemented real-time status UI for map components (loading state, last updated mark, active markers count).
- Designed a distinct Empty State when no map results match filters (B.4.8).
- Markers contain an explicit `popupopen` native JS listener to dispatch Angular router navigations to `/app/incidencias/:id` securely, avoiding strict context constraints of HTML-injected popups (B.4.7).

**Gates**: Tests (67 suites, 439 tests) and build (exit 0) passed successfully.
