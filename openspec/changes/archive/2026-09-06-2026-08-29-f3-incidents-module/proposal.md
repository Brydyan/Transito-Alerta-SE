# Proposal: F3 — Módulo de Incidencias

## Intent

Incidencias es el dominio central del producto y **no tiene una sola pantalla**.
El backend está completo y ejercitado por cinco changes archivados
(`t5.1-incident-workflow`, `t5.2-incident-analytics`, `t5.3-operator-tracking`,
`t5.4-map-ui-support`, `t5.6-admin-panel-backend`); `frontend/src/app/core/services/incident.service.ts`
existe y **ningún componente lo consume**.

Es el hueco más caro del proyecto: todo lo demás —catálogos, feed, mapa, dashboard—
existe para alimentar o mostrar incidencias.

Alcance derivado del mock 02-01 (listado de organización):

- Tabla con selección múltiple, título con subtítulo de categoría, badges de
  prioridad y estado, ubicación, fecha y menú de acciones
- Barra de filtros: búsqueda por título o descripción, selector de estado, selector
  de prioridad, botón de filtrar y botón de limpiar
- Paginación con conteo («Mostrando 1-10 de 14 incidencias»)
- Tres tarjetas de contexto al pie: cobertura territorial, incidencias abiertas,
  tiempo de respuesta

El detalle de incidencia no tiene mock propio, pero es inevitable: el listado
ofrece «Ver detalle» y los comentarios del dominio `comments` no tienen otro sitio
donde vivir. Se diseña a partir de los contratos del backend, y se anota como
decisión, no como suposición silenciosa.

## Scope

### In Scope
- `/app/incidencias` — listado con filtros, selección múltiple, paginación
- `/app/incidencias/:id` — detalle: datos, historial de estado, comentarios,
  imágenes, acciones de flujo
- Hilo de comentarios sobre `comment.service.ts` (ya existe, sin consumidor)
- Acciones de flujo de trabajo: reclamar, liberar, cambiar estado, asignar
- Historial de estado desde el módulo `status-history`
- Galería de imágenes de la incidencia
- Tarjetas de contexto al pie del listado
- Sustituir el placeholder `/incidencias` de F1

### Out of Scope
- Feed público de ciudadano y asistente de reporte → **F4**
- Mapa a pantalla completa → **F4**; el detalle sí muestra un mini-mapa de ubicación
- Rediseño del dashboard → **F6**
- Exportación a PDF (`pdfmake` y `ngx-extended-pdf-viewer` están instalados y
  `pdf-previewer` existe, pero ningún mock define el documento)
- Acciones masivas sobre la selección múltiple: el mock muestra las casillas pero
  no la barra de acciones correspondiente → ver Q1

## Capabilities

### New Capabilities
- `frontend-incidents`: listado con filtros, detalle, hilo de comentarios y acciones
  de flujo de trabajo

### Modified Capabilities
- ninguna del lado backend

## DB Schema Changes

Ninguna. `incidents`, `comments`, `comment_images`, `status_history` y `assignments`
existen desde las migraciones `0001`–`0030`.

## Permission Requirements (RBAC)

Sin permisos nuevos. Se consumen:

| Acción | Permiso |
|---|---|
| Ver listado y detalle | `READ incidents` |
| Cambiar estado / reclamar / liberar | `UPDATE incidents` |
| Asignar operador | `ASSIGN assignments` |
| Leer comentarios | `READ comments` |
| Comentar | `CREATE comments` |
| Adjuntar imágenes a comentario | `CREATE comment-images` |

`operador_org` (15 permisos) debe poder trabajar incidencias sin ver acciones
administrativas. La UI DEBE reflejarlo con `*hasPermission` (entregado en F2).

## Domain Module Dependencies

- `backend/src/modules/incidents` — CRUD y flujo de trabajo
- `backend/src/modules/comments` + `comment-images`
- `backend/src/modules/status-history` — historial
- `backend/src/modules/assignments` — asignación a operador
- `backend/src/modules/realtime` — actualizaciones en vivo (ver Q2)
- Frontend: `incident.service.ts`, `comment.service.ts` (ambos existentes sin consumidor)

## Approach

Listado primero, detalle después. El listado es un consumidor puro de los primitivos
de F0 más el patrón de filtros que F2 dejó probado, así que sale rápido; el detalle
concentra la complejidad real (flujo de trabajo, comentarios anidados, historial).

Los comentarios reutilizan `comment.service.ts` tal cual está. SC-209 ya corrigió su
contrato de subida de imágenes a multi-archivo con campo `images`; F3 es el primer
consumidor real de ese trabajo y, por tanto, su primera verificación de extremo a extremo.

## Dependencies

- **Depende de**: F0 (primitivos), F1 (ruta `/incidencias`), F2 (`*hasPermission`,
  `permissionGuard`, y el patrón de filtros ya probado)
- **Bloquea**: nada. F4 comparte modelos con F3 pero puede desarrollarse en paralelo
  si se acuerda el modelo `Incident` primero.

## Risks

- **R1 — Deriva de contrato en `incident.service.ts`.** El servicio existe pero nunca
  tuvo consumidor, así que su mapeo nunca se ejerció contra el wire real. Es
  exactamente el escenario de SC-209. Mitigación: revalidar cada campo contra el
  controlador antes de construir la UI, y afirmar sobre campos mapeados en los tests.
- **R2 — Alcance del detalle sin mock.** Se diseña desde los contratos del backend.
  Riesgo de divergir de lo que el diseñador esperaba. Mitigación: mantener el detalle
  ceñido a lo que el backend ya expone, sin inventar funcionalidad.
