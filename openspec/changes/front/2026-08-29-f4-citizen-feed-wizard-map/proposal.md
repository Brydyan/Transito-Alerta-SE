# Proposal: F4 — Ciudadano: feed, asistente de reporte y mapa

## Intent

La cara pública del producto: donde el ciudadano ve lo que pasa en su zona, reporta
una incidencia y la ubica en el mapa. Tres pantallas del mock, ninguna implementada.

| Pantalla | Mock | Backend | Frontend |
|---|---|---|---|
| Feed de incidencias | 09-01 | parcial — faltan dos acciones | ausente |
| Asistente de reporte (4 pasos) | 09-02 → 09-05 | completo | `citizen-report` sin ruta |
| Mapa a pantalla completa | 11-01 | completo (`map`, `geofencing`) | ausente |

A diferencia de F2 y F3, esta fase **sí requiere backend nuevo**. El feed del mock
09-01 ofrece dos acciones por tarjeta que no existen en ningún módulo:

- **«Seguir»** — suscribirse a una incidencia para recibir sus novedades
- **«Yo también reporto»** — corroborar una incidencia ya publicada en lugar de
  crear un duplicado

Ambas son sustantivas, no adorno: la corroboración es el mecanismo que evita que la
misma bache genere cuarenta incidencias, y el seguimiento es lo que da sentido al
módulo `notifications` desde el lado ciudadano.

El resto del inventario ya está: `leaflet@1.9.4`, `@turf/boolean-point-in-polygon`,
`dexie` e `idb` están instalados, y `geolocation.service.ts`, `offline-sync.service.ts`
e `image-compressor.service.ts` existen sin consumidor.

## Scope

### In Scope — Fase A (backend, prerequisito del feed)
- Entidad, migración y endpoints de **seguimiento** de incidencias
- Entidad, migración y endpoints de **corroboración** («yo también reporto»)
- Conteos agregados expuestos en el detalle y el listado de incidencias
- Permisos nuevos y su asignación a los roles existentes

### In Scope — Fase B (frontend)
- `/app/inicio` — feed con composer, tarjetas, filtros laterales, estadísticas del
  día y ranking de zonas (mock 09-01)
- `/app/reportar` — asistente de cuatro pasos (mocks 09-02 → 09-05), sobre el
  `citizen-report` existente que F1 dejó enrutado
- `/app/mapa` — mapa a pantalla completa con agrupación de marcadores y panel de
  filtros flotante (mock 11-01)
- Captura de ubicación con `geolocation.service.ts`
- Compresión de imágenes con `image-compressor.service.ts`

### In Scope — Fase B (añadido 2026-08-29 tras aclaración del equipo)
- **Reporte anónimo y de emergencia sin sesión.** Reincorporado al alcance: se había
  descartado por falta de mock, pero el backend **ya lo soporta por completo** y no
  exponerlo deja construida una capacidad clave sin puerta de entrada.

  Verificado:
  - `database/migrations/0001_initial_schema.sql:49` crea el usuario con
    `device_uuid = 'anonymous'`
  - `backend/src/config/auth.config.ts:74-80` define su techo de permisos:
    `READ/CREATE incidents`, `READ/CREATE comments` — leer y contribuir, nunca modificar
  - `backend/src/config/auth.config.spec.ts:56` lo dice literal: *«lets an anonymous
    device report an emergency without logging in»*

  El techo anónimo **no** se toca: se consume tal cual. La emergencia se expresa con la
  prioridad `alta` del asistente, no con un tipo nuevo de incidencia.

### Out of Scope
- Envío diferido sin conexión: `offline-sync.service.ts` existe y las dependencias
  están instaladas, pero ningún mock define el comportamiento → ver Q2
- Notificaciones push
- Moderación de contenido del feed

## Capabilities

### New Capabilities
- `incident-social`: seguimiento y corroboración de incidencias (backend, Fase A)
- `frontend-citizen`: feed, asistente de reporte y mapa (Fase B)

### Modified Capabilities
- `incident-workflow`: el listado y el detalle de incidencias pasan a exponer
  `follower_count` y `corroboration_count`

## DB Schema Changes

Dos tablas nuevas (Fase A). Numeración a confirmar contra `database/MIGRATION_LOG.md`
al implementar; la última aplicada es `0042`.

**`incident_followers`**
- `id` uuid PK · `incident_id` uuid FK → `incidents` · `user_id` uuid FK → `users`
- `created_at` timestamptz
- `UNIQUE (incident_id, user_id)` — seguir dos veces es idempotente, no un duplicado
- Índice sobre `user_id` para «mis incidencias seguidas»

**`incident_corroborations`**
- `id` uuid PK · `incident_id` uuid FK → `incidents` · `user_id` uuid FK → `users`
- `comment` text NULL · `created_at` timestamptz
- `UNIQUE (incident_id, user_id)` — un usuario corrobora una vez
- Índice sobre `incident_id` para el conteo

Ambas siguen el patrón de borrado lógico establecido en el proyecto si el diseño lo
confirma necesario; ver D3 del diseño, donde se argumenta lo contrario.

## Permission Requirements (RBAC)

Permisos nuevos:

| Permiso | Roles |
|---|---|
| `CREATE incident-followers` | todos los roles autenticados |
| `DELETE incident-followers` | propietario del seguimiento |
| `CREATE incident-corroborations` | todos los roles autenticados |

Se añaden al catálogo de permisos y se asignan en migración a los cuatro roles
(`master`, `operador_sistema`, `admin_org`, `operador_org`).

**Atención — modelo denormalizado**: `users.permissions` es una copia de
`roles.permissions` tomada en el momento de la asignación. Añadir permisos al rol
**no** los propaga a los usuarios existentes. La migración debe actualizar ambas
tablas, y hay que invalidar `perm:v3:uid:*` en Redis tras desplegar. Esto ya causó
un menú vacío en una sesión anterior; queda como tarea explícita, no como nota al pie.

## Domain Module Dependencies

- `backend/src/modules/incidents` — anfitrión de los conteos agregados
- `backend/src/modules/notifications` — consumidor natural del seguimiento
- `backend/src/modules/map`, `geofencing` — datos del mapa
- `backend/src/modules/incident-categories`, `geo-zones` — filtros del feed
- Frontend: `incident.service.ts`, `geolocation.service.ts`, `image-compressor.service.ts`

## Approach

Dos fases con compuerta, siguiendo el patrón de SC-209 en este mismo repositorio:
**B no se integra antes que A**. El feed sin las dos acciones sociales sería una
lista de tarjetas con botones muertos.

Dentro de la Fase B se empieza por el asistente de reporte: es la que menos incógnitas
tiene —el backend de incidencias está probado por F3— y valida la captura de ubicación
y la compresión de imágenes, que el feed y el mapa después reutilizan.

## Dependencies

- **Depende de**: F0 (primitivos), F1 (rutas `/inicio`, `/reportar`, `/mapa`),
  F3 (modelo `Incident` revalidado — F4 no debe volver a derivarlo)
- **Bloquea**: nada

## Risks

- **R1 — Propagación de permisos denormalizados.** Detallado arriba. Es un fallo ya
  vivido en este proyecto, no hipotético.
- **R2 — Rendimiento del mapa.** El mock 11-01 muestra agrupación con cifras (10, 5, 4).
  Sin agrupación en servidor o en cliente, unos miles de marcadores bloquean el hilo
  principal. Se resuelve en el diseño con un umbral explícito.
- **R3 — El asistente pierde datos al recargar.** Cuatro pasos con fotos es una
  inversión que el usuario no debería perder por un refresco accidental. Se persiste
  el borrador; ver D6.
