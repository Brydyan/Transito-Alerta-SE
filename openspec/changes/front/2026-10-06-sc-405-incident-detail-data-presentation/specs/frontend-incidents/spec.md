# Spec: Detalle de incidencia — presentación de datos y acceso al historial

## Domain: frontend-incidents (MODIFIED)

### Problema

El detalle de una incidencia (`/app/incidencias/:id`) muestra datos crudos que un
usuario final no puede interpretar y bloquea el acceso al historial de estado con
un toast de permisos. Es un problema de **presentación**, no de disponibilidad: el
backend devuelve los datos, pero la vista los imprime sin resolver.

Síntomas reportados (rol `master`, organización `NULL`):

1. `Reportada por ad234dfd-1048-42a1-a712-690706ebff9e` — UUID de ciudadano.
2. `Zona: a5527dde-2786-57d5-aa35-d2362c0d2eff` — UUID de zona geográfica.
3. `Lat -2.22853, Lng -80.86327` — coordenadas decimales sin contexto legible.
4. `Vista de mapa pendiente (Leaflet) — sigue F3.6.`
5. `Vista de galería pendiente (endpoint incident-images). Sigue F3.6.`
6. Al publicar un comentario, se observa un recargo de la página y aparece
   `Missing permission: READ status-history`.

#### Causa raíz verificada del síntoma 6

El toast sale de `backend/src/common/guards/permission.guard.ts:76`
(`Missing permission: ${formatPermissionString(...)}`) y es mostrado por
`frontend/src/app/core/interceptors/error.interceptor.ts:35-39`, que traduce
**todo 403** en un toast con el `message` del cuerpo.

La ruta `GET /api/incidents/:incidentId/status-history` exige
`@RequirePermission('READ', 'status-history')`
(`backend/src/modules/status-history/status-history.controller.ts:26`).

- La migración `0014_status_history.sql:84` **crea la fila en el catálogo**
  `('status-history', 'READ')`, pero **no la otorga a ningún rol**.
- Ninguna migración posterior (`0049`, `0050`, `0052`, `0053`, `0054`, `0056`,
  `0057`, `0058`, `0059`) agrega `status-history` a `roles.permissions`.
- `0052_missing_permissions_catalog.sql` es el precedente exacto: documenta el
  mismo gap para `dashboard` y `assignments` y lo cierra con
  `INSERT ... ON CONFLICT DO NOTHING` + `UPDATE roles` + denormalización a
  `users.permissions` con bump de `permission_version`.

Evidencia consultada en la base viva (`tase-postgres` / `transito_alerta`):

| Consulta | Resultado |
| --- | --- |
| Catálogo `status-history` | `29ea5f82-4629-4896-96b3-989a7b7a3541` |
| `master` posee ese UUID | **NO-LO-TIENE** |
| Roles que lo poseen | **(cero filas)** |

Permisos efectivos de `master` para los recursos del detalle:
`comments` (CREATE/DELETE/READ/UPDATE), `incidents` (CLOSE/CREATE/DELETE/READ/
REVEAL/UPDATE) — **`status-history` ausente**.

Esto lo confirma además el e2e `test/e2e/status-history.e2e-spec.ts:194`
(`TS-8: READ incidents alone is insufficient — 403`), que trata la separación
como guard de seguridad intencional: el fallo no es el guard, es el **grant
faltante**.

#### Observación no reproducida: «recarga de la página»

El código declara lo contrario a un recargo:

- `comment-thread.component.ts:124` — comentario publicado con
  `commentsChanged.emit(...)` bajo el comentario `F3.5.6 — publicar e insertar
  en el hilo sin recargar`.
- `incident-detail.component.ts:320` — `onCommentsChanged` sólo hace
  `comments.set(...)`.
- `loadIncident()` sólo se invoca desde `ngOnInit` (`incident-detail.component.ts:118`).
- No existe ningún `window.location.reload()` ni `location.reload()` en
  `frontend/src/app/core` ni en `frontend/src/app/features/incidents`.

Se registra como **síntoma reportado sin causa identificada**: requiere
reproducción antes de tratarse como defecto. El toast sí es reproducible en cada
carga del detalle.

### Requirement: Identidad resuelta, nunca UUIDs crudos

El detalle DEBE mostrar la identidad de autor y de zona como valores legibles;
los UUIDs NO deben renderizarse como texto visible.

- Scenario: Reportada por — GIVEN una incidencia con `citizen_id`
  THEN se muestra el nombre (y/o correo) del ciudadano, nunca el UUID de 36
  caracteres
- Scenario: Ciudadano no resuelto — GIVEN un `citizen_id` sin fila asociada
  THEN se muestra un rótulo alternativo (p. ej. «Ciudadano no disponible»), no
  el identificador crudo
- Scenario: Zona — GIVEN una incidencia con `zone_id`
  THEN se muestra el nombre de la zona geográfica, nunca el UUID
- Scenario: Zona desconocida — GIVEN un `zone_id` sin fila asociada
  THEN se muestra «Zona no disponible» o se omite el renglón, nunca el UUID

### Requirement: Ubicación con contexto legible

El bloque de ubicación DEBE presentar la coordenada de forma comprensible; las
coordenadas decimales NO constituyen por sí solas una ubicación presentable.

- Scenario: Coordenadas — GIVEN una incidencia con `lat` y `lng`
  THEN se muestra una ubicación descriptiva (dirección o nombre de zona
  resuelto) y las coordenadas sólo como dato secundario
- Scenario: Sin coordenadas — GIVEN una incidencia sin coordenadas
  THEN el bloque se omite sin dejar un contenedor vacío
- Scenario: Sin resolución de dirección — GIVEN que no existe geocodificación
  inversa disponible
  THEN se muestra la zona resuelta como ubicación principal en lugar de las
  coordenadas desnudas

### Requirement: Mini-mapa del punto reportado

El detalle DEBE renderizar un mini-mapa centrado en el punto de la incidencia,
cerrando el placeholder F3.6.

- Scenario: Mapa — GIVEN una incidencia con coordenadas válidas
  THEN se muestra un mini-mapa con un marcador en el punto
- Scenario: Sin coordenadas — GIVEN una incidencia sin coordenadas
  THEN no se intenta renderizar mapa ni marcador

### Requirement: Galería de imágenes del incidente

El detalle DEBE mostrar la galería de imágenes de la incidencia, cerrando el
placeholder F3.6. El endpoint `incident-images` ya existe en el backend
(`backend/src/modules/incidents/incident-images.controller.ts`), por lo que el
trabajo pendiente es de presentación e integración en la vista.

- Scenario: Con imágenes — GIVEN una incidencia con imágenes adjuntas
  THEN se muestran en galería dentro del detalle
- Scenario: Sin imágenes — GIVEN una incidencia sin imágenes
  THEN la sección se omite o muestra un estado vacío, sin texto de placeholder
  indicando un trabajo pendiente
- Scenario: Carga fallida — GIVEN un fallo al obtener las imágenes
  THEN se muestra un estado de error local dentro de la tarjeta, sin degradar
  el resto del detalle

### Requirement: Acceso al historial de estado para roles autorizados

Todo rol que pueda leer una incidencia DEBE poder consultar su historial de
estado sin recibir 403, y ningún 403 por permisos DEBE manifestarse como un
bloqueo inesperado en el detalle.

- Scenario: Grant faltante — GIVEN que la fila `('status-history', 'READ')`
  existe en el catálogo pero ningún rol la posee
  THEN se otorga explícitamente a los roles que requieren consultar el
  historial (incluido `master`), con denormalización a `users.permissions` y
  bump de `permission_version`
- Scenario: Detalle con rol `master` — GIVEN un usuario `master`
  WHEN abre el detalle de una incidencia
  THEN las tres peticiones del detalle (`GET /incidents/:id`,
  `GET /comments/incident/:id`, `GET /incidents/:id/status-history`) resuelven
  sin 403 y no se emite ningún toast de permisos
- Scenario: Sin historial — GIVEN una incidencia sin transiciones registradas
  THEN la tarjeta muestra «Sin cambios de estado registrados.»
- Scenario: Seguridad preservada — GIVEN un rol sin `READ status-history`
  WHEN consulta el historial de otra organización
  THEN la respuesta sigue siendo denegada según el guard D1 existente

### Requirement: Publicar comentario sin bloqueos derivados

Publicar un comentario DEBE resolverse en el hilo actual, sin recargar la página
ni emitir toasts de permisos no relacionados.

- Scenario: Comentario publicado — GIVEN un comentario válido
  WHEN se envía THEN aparece en el hilo de inmediato, en la misma sesión de
  vista, sin recarga completa
- Scenario: Toast no relacionado — GIVEN que el comentario se crea con éxito
  THEN no aparece ningún `Missing permission: READ status-history`
- Scenario: Fallo de publicación — GIVEN un error real al crear el comentario
  THEN se muestra un error dentro del hilo, sin recargar el detalle

---

## Hallazgos relacionados (fuera del alcance de este spec)

No son problemas de presentación del detalle, pero aparecieron en el mismo
sondeo y conviene no perderlos:

- `GET /api/incidents/feed?limit=5` devuelve **400**. `FeedQueryDto`
  (`backend/src/modules/incidents/dto/feed-query.dto.ts`) no declara `limit`
  (usa `per_page`), y el `ValidationPipe` global con `forbidNonWhitelisted: true`
  (`backend/src/main.ts:75-79`) lo rechaza. Quien envía `limit` es
  `dashboard.service.ts:53-62` (`getRecentActivity(limit = 5)`), invocado desde
  `dashboard.component.ts`. Es independiente del toast de `status-history`.
