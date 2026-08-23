# Design: T5.6 — Admin Panel Backend + CRUD Gaps

**Change**: t5.6-admin-panel-backend
**Date**: 2026-08-23

---

## Decisiones técnicas

### D1 — Roles CRUD extiende RolesController sin reestructura del módulo

`RolesController` pasa de 2 endpoints a 8. Se añaden los métodos CRUD estándar y
`syncPermissions`. El `RolesService` ya mantiene la tabla `roles`; se extiende con
`create()`, `update()`, `delete()`, `syncPermissions()`.

`syncPermissions` reemplaza el set completo de permisos del rol (PUT semántico, no patch).
El patrón es: DELETE FROM role_permissions WHERE role_id = :id, luego INSERT de los nuevos.
Dentro de una transacción para evitar estado inconsistente.

Restricción en DELETE rol: 409 si existe algún usuario con ese rol asignado — misma
política que GeoReporta (prevent orphan permissions).

### D2 — Organizations extras como métodos en OrganizationsController (sin nuevo controller)

`tree()`: query recursiva sobre la tabla `organizations` usando CTE o carga eager de
relaciones padre/hijo (si el volumen lo permite). GeoReporta usa Eloquent con closure
table; NestJS puede usar TypeORM self-referencing relation + `manager.getTreeRepository()`
si la entidad es `@Tree('closure-table')`, o un CTE raw si no.

`formData()`: retorna `{ roles, geoZones }`. Llama a `RolesService.findAll()` y
`GeoZonesService.findAll()`. Sin paginación — son catálogos cortos.

`notifiedFor(lat, lng)`: consulta qué geo-zones contienen el punto, luego retorna
las organizaciones asociadas a esas zones. Reutiliza `GeoZonesService.findZoneForPoint()`
(ya existe para el flujo de Incidents).

### D3 — Users admin CRUD: endpoints separados de self-management

El módulo `users` ya tiene `/me` (self) y `PATCH :id/organization` (admin). Se añaden
los 4 endpoints admin. Todos requieren `@RequirePermission('X', 'users')`.

Soft delete: añade campo `deleted_at` a la entidad User (si no existe) + TypeORM
`@DeleteDateColumn`. Las queries existentes (`findAll`, etc.) auto-excluyen soft-deleted.
Si `deleted_at` ya existe en el schema, es un no-op en migrations.

Admin create (`POST /users`): crea usuario + genera contraseña temporal o envía invitación.
Decisión: delegar a `InvitationsService` — admin invite es el mismo flujo que T3.6.
`POST /users` puede ser un wrapper que llama `InvitationsService.invite()`. Evita duplicar
lógica de onboarding.

### D4 — Notifications approve/reject: patrón Command con pessimistic locking

**Prerrequisito schema** (Fase 0 de tasks):
- Migration: añadir `closed` al CHECK constraint de `incidents.status` + actualizar `IncidentStatus` type + `LEGAL_TRANSITIONS` (resolved → ['closed']) + `UpdateIncidentStatusDto`
- Migration: añadir decision columns a `incidents` (`approved_by/at`, `rejected_by/at`, `rejection_reason`) + 3 CHECK constraints XOR + partial index `idx_incidents_decided`
- Migration: añadir `incident_pending_approval` al CHECK de `notifications.type` + añadir al `NotificationType` enum de TypeScript
- Migration: añadir `notes` (nullable text) a `status_history` + añadir a `StatusHistoryEntity`

**Implementación del servicio** (análoga a GeoReporta `IncidentApprovalService`):

`approve(notificationId, actorId)` en `NotificationsService`:
1. `DataSource.transaction()` con `manager.getRepository(Notification).findOne({ lock: { mode: 'pessimistic_write' } })` y lo mismo para el incident — previene double-click concurrente
2. Guard: notificación tipo `incident_pending_approval`, `processed_at IS NULL`, incident en `resolved`
3. Transiciona incident a `closed`, escribe `approved_by = actor.id`, `approved_at = now()`
4. Limpia `rejected_by/at/reason` a null (por si había un rechazo previo)
5. Marca `notification.processed_at = now(), read = true`
6. Marca siblings (misma `incident_id + type + processed_at IS NULL`) como processed
7. Notifica al ciudadano (status_change: "incidencia cerrada por admin")
8. Si `incident.claimed_by ≠ null`: notifica al claimant ("resolución aprobada")

`reject(notificationId, actorId, reason)` en `NotificationsService`:
1. Same transaction + lock pattern
2. Guard: igual que approve pero sin chequear `approved_at`
3. `nextStatus = claimed_by activo → in_progress | sin claimant → pending`
4. Transiciona incident, escribe `rejected_by`, `rejected_at`, `rejection_reason`, limpia `approved_*`
5. Si claimant inexistente/eliminado: limpiar `claimed_by/at`
6. Crea `Comment` de auditoría (type: system, content: reason) en la tabla `comments`
7. Marca notification processed + siblings
8. Si claimant activo: notifica al claimant ("resolución rechazada")

**IMPORTANTE**: `closed` ya NO pasa por `LEGAL_TRANSITIONS` de `IncidentsService.transitionStatus()` — el approve/reject es una ruta especial que escribe directamente sobre el incident dentro de la transacción. No pasar por la máquina de estados normal para evitar que la transición `resolved → closed` sea accesible vía `PATCH /incidents/:id/status`.

### D5 — Incidents PATCH/:id sin conflicto con PATCH/:id/status

NestJS router resuelve `PATCH :id/status` antes de `PATCH :id` si el route está
registrado primero (orden de declaración en el controller). Verificar que `updateStatus`
sigue registrado antes de `update` en el array de decoradores del controller.

Incident update solo permite: `title`, `description`, `category_id`. Campos como
`status`, `zone_id`, `geofence_matched`, `organization_id` son inmutables por esta ruta.

### D6 — Comments PATCH/:id requiere ownership check

El `PermissionGuard` verifica `UPDATE comments` (permiso del rol), pero el ownership
(solo el autor puede editar su propio comentario) es una regla de negocio adicional. Se
implementa en `CommentsService.update()` comparando `comment.author_id === req.user.id`.
Si no coincide → lanzar `ForbiddenException`. Mismo patrón que `destroy()` que ya tiene
este check.

### D7 — `DELETE incidents/:id` es soft delete por consistencia de audit trail

Incidents tienen `status_history` y `assignments` — hard delete pierde esa historia.
Añadir `deleted_at` a incidents (si no existe) igual que usuarios. Si ya existe en el
schema de GeoReporta (revisar migrations), no se necesita nueva migration.

---

## Archivos afectados

```
backend/src/modules/roles/
  roles.controller.ts      — añadir CRUD + syncPermissions
  roles.service.ts         — añadir create/update/delete/syncPermissions
  dto/
    create-role.dto.ts     — nuevo
    update-role.dto.ts     — nuevo
    sync-permissions.dto.ts — nuevo

backend/src/modules/organizations/
  organizations.controller.ts  — añadir tree/formData/notifiedFor
  organizations.service.ts     — añadir tree/formData/notifiedFor

backend/src/modules/users/
  users.controller.ts      — añadir POST/GET:id/PATCH:id/DELETE:id admin
  users.service.ts         — añadir create/findOne/updateAdmin/softDelete

backend/src/modules/notifications/
  notifications.controller.ts  — añadir approve/reject
  notifications.service.ts     — añadir approve/reject

backend/src/modules/incidents/
  incidents.controller.ts  — añadir PATCH:id/DELETE:id
  incidents.service.ts     — añadir update/delete

backend/src/modules/assignments/
  assignments.controller.ts — añadir PATCH:id
  assignments.service.ts    — añadir update

backend/src/modules/comments/
  comments.controller.ts   — añadir GET:id / PATCH:id
  comments.service.ts      — añadir findOne/update
```

Sin nuevas migraciones si `deleted_at` ya existe en `incidents` y `users`.
Verificar contra migrations 0001-0018 antes de aplicar.

---

## Matriz de permisos requeridos

| Endpoint | Permiso |
|----------|---------|
| GET /roles | `READ roles` |
| POST /roles | `CREATE roles` |
| PATCH /roles/:id | `UPDATE roles` |
| DELETE /roles/:id | `DELETE roles` |
| PUT /roles/:id/permissions | `UPDATE roles` |
| GET /organizations/tree | auth (sin permiso extra) |
| GET /organizations/form-data | `CREATE organizations` OR `UPDATE organizations` |
| GET /organizations/notified-for | auth |
| POST /users | `CREATE users` |
| GET /users/:id | `READ users` |
| PATCH /users/:id | `UPDATE users` |
| DELETE /users/:id | `DELETE users` |
| POST /notifications/:id/approve | `UPDATE notifications` |
| POST /notifications/:id/reject | `UPDATE notifications` |
| PATCH /incidents/:id | `UPDATE incidents` |
| DELETE /incidents/:id | `DELETE incidents` |
| PATCH /assignments/:id | `UPDATE assignments` |
| GET /comments/:id | auth |
| PATCH /comments/:id | auth + ownership |
