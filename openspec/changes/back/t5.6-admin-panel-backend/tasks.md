# Tasks: T5.6 — Admin Panel Backend + CRUD Gaps

**Change**: t5.6-admin-panel-backend
**Date**: 2026-08-23
**Prerequisitos**: T2.1 (Incidents), T3.1 (Roles), T3.3 (Notifications), T3.6 (Invitations), T3.8 (Geo-zones), T5.1 (Incident Workflow)
**Directorio de trabajo**: `backend/`

---

## Fase 0 — Schema migrations (prerrequisito para Fases 4 y 5)

> Detectados en segunda auditoría profunda (2026-08-23). GeoReporta tiene estos campos/estados; NestJS no.

- [x] **T0.1** Migration `0020_add_closed_status_to_incidents.sql`:
  - `ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check`
  - `ALTER TABLE incidents ADD CONSTRAINT incidents_status_check CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed'))`
  - Actualizar `IncidentStatus` type en `incident.entity.ts`: añadir `'closed'`
  - Actualizar `LEGAL_TRANSITIONS` en `incidents.service.ts`: `resolved: ['closed']` (pero ver D4 — la transición a `closed` solo ocurre vía approve, no vía `PATCH /incidents/:id/status`)
  - Actualizar `UpdateIncidentStatusDto`: NO añadir `'closed'` — el DTO solo cubre transiciones manuales; `closed` es exclusivo del flujo approve

- [x] **T0.2** Migration `0021_add_decision_columns_to_incidents.sql`:
  - Columnas: `approved_by UUID REFERENCES users(id) ON DELETE SET NULL`, `approved_at TIMESTAMPTZ`, `rejected_by UUID REFERENCES users(id) ON DELETE SET NULL`, `rejected_at TIMESTAMPTZ`, `rejection_reason TEXT`
  - CHECK: `(approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)` — par aprobación
  - CHECK: `(rejected_by IS NULL AND rejected_at IS NULL) OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL)` — par rechazo
  - CHECK: `NOT (approved_by IS NOT NULL AND rejected_by IS NOT NULL)` — XOR decisión
  - Partial index: `CREATE INDEX idx_incidents_decided ON incidents (approved_at) WHERE approved_at IS NOT NULL`
  - Añadir campos a `IncidentEntity`: `approvedBy`, `approvedAt`, `rejectedBy`, `rejectedAt`, `rejectionReason`

- [x] **T0.3** Migration `0022_add_incident_pending_approval_notification_type.sql`:
  - `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check`
  - `ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('incident.created', 'incident.assigned', 'incident.status_changed', 'comment.added', 'incident_pending_approval'))`
  - Añadir `INCIDENT_PENDING_APPROVAL = 'incident_pending_approval'` al `NotificationType` enum en `notification.entity.ts`

- [x] **T0.4** Migration `0023_add_notes_to_status_history.sql`:
  - `ALTER TABLE status_history ADD COLUMN notes TEXT`
  - Añadir `@Column({ nullable: true }) notes?: string` a `StatusHistoryEntity`

---

## Fase 1 — Roles CRUD completo

- [x] **T1.1** Crear `CreateRoleDto` (`name: string`, validación NotEmpty)
- [x] **T1.2** Crear `UpdateRoleDto` (Partial de CreateRoleDto)
- [x] **T1.3** Crear `SyncPermissionsDto` (`permissions: string[]`)
- [x] **T1.4** Añadir `create(dto)` en `RolesService` — INSERT en tabla `roles`
- [x] **T1.5** Añadir `findAll()` en `RolesService` — lista roles con sus permisos
- [x] **T1.6** Añadir `findOne(id)` en `RolesService` — 404 si no existe
- [x] **T1.7** Añadir `update(id, dto)` en `RolesService`
- [x] **T1.8** Añadir `delete(id)` en `RolesService` — 409 si tiene usuarios asignados
- [x] **T1.9** Añadir `syncPermissions(id, permissions[])` en `RolesService` — DELETE + INSERT en transacción
- [x] **T1.10** Añadir endpoints en `RolesController`:
  - `GET /roles` → `findAll()` con `@RequirePermission('READ')`
  - `GET /roles/:id` → `findOne(id)` con `@RequirePermission('READ')`
  - `POST /roles` → `create(dto)` con `@RequirePermission('CREATE')`
  - `PATCH /roles/:id` → `update(id, dto)` con `@RequirePermission('UPDATE')`
  - `DELETE /roles/:id` → `delete(id)` con `@RequirePermission('DELETE')`
  - `PUT /roles/:id/permissions` → `syncPermissions(id, dto)` con `@RequirePermission('UPDATE')`
- [x] **T1.11** Tests unitarios para `RolesService.syncPermissions` (transacción, idempotencia)

---

## Fase 2 — Organizations extras

- [x] **T2.1** Añadir `tree()` en `OrganizationsService` — carga relaciones parent/children recursivamente
- [x] **T2.2** Añadir `formData()` en `OrganizationsService` — retorna `{ roles, geoZones }`
- [x] **T2.3** Añadir `notifiedFor(lat, lng)` en `OrganizationsService` — reutiliza `GeoZonesService.findZoneForPoint()`
- [x] **T2.4** Añadir endpoints en `OrganizationsController`:
  - `GET /organizations/tree` → `tree()` sin permiso extra (auth only) — antes del apiResource
  - `GET /organizations/form-data` → `formData()` con `@RequirePermission('READ')`
  - `GET /organizations/notified-for?lat&lng` → `notifiedFor()` con auth only

---

## Fase 3 — Users admin CRUD

- [x] **T3.1** Verificar si `deleted_at` existe en tabla `users` (revisar migrations 0001-0018)
  - Si no existe: crear migration `0021_add_deleted_at_to_users.sql`
  - Añadir `@DeleteDateColumn()` a `UserEntity`
- [x] **T3.2** Añadir `adminCreate(dto)` en `UsersService` — delegar a `InvitationsService.invite()` (flujo T3.6)
- [x] **T3.3** Añadir `findOne(id)` en `UsersService` con relaciones role + org; 404 si no existe
- [x] **T3.4** Añadir `adminUpdate(id, dto)` en `UsersService` — permite actualizar `name`, `email`, `role_id`, `organization_id`
- [x] **T3.5** Añadir `softDelete(id)` en `UsersService` — llama `TypeORM.softDelete(id)`
- [x] **T3.6** Añadir endpoints en `UsersController`:
  - `POST /users` → `adminCreate(dto)` con `@RequirePermission('CREATE')`
  - `GET /users/:id` → `findOne(id)` con `@RequirePermission('READ')` — ANTES de rutas existentes
  - `PATCH /users/:id` → `adminUpdate(id, dto)` con `@RequirePermission('UPDATE')` — NO confundir con `PATCH :id/organization`
  - `DELETE /users/:id` → `softDelete(id)` con `@RequirePermission('DELETE')`

---

## Fase 4 — Notifications moderación (approve/reject)

> Prerrequisito: Fase 0 completa (T0.1-T0.4) — `closed` status, decision columns, notification type.

- [x] **T4.1** Crear `IncidentApprovalService` en `backend/src/modules/notifications/services/incident-approval.service.ts`:
  - `approve(notificationId, actorId)`:
    - `DataSource.transaction()` con lock pessimista sobre notificación e incidente
    - Guard: tipo `INCIDENT_PENDING_APPROVAL`, `processed_at IS NULL`, incident en `resolved`
    - Escribe `incident.status = 'closed'`, `approved_by/at = now()`, limpia `rejected_*`
    - Marca notification + siblings (mismo incident_id + type + processed_at IS NULL) como `processed_at = now(), read = true`
    - Notifica al ciudadano + al claimant si existe
  - `reject(notificationId, actorId, reason)`:
    - Same transaction + lock
    - Guard igual (pero sin chequear `approved_at`)
    - `nextStatus = claimed_by activo → 'in_progress' | sin claimant → 'pending'`
    - Escribe `rejected_by/at/reason`, limpia `approved_*`; si claimant inexistente → limpia `claimed_by/at`
    - Crea `Comment` de auditoría con `content: reason`
    - Marca notification + siblings processed
    - Notifica al claimant si activo
- [x] **T4.2** Crear `RejectNotificationDto` (`reason: string`, `@MinLength(10)`, `@MaxLength(500)`)
- [x] **T4.3** Añadir endpoints en `NotificationsController`:
  - `POST /notifications/:id/approve` → `approvalService.approve()` con `@RequirePermission('UPDATE')`
  - `POST /notifications/:id/reject` → `approvalService.reject()` con `@RequirePermission('UPDATE')`
- [x] **T4.4** Test unitario: approve idempotencia (409 si `processed_at` ya existe)
- [x] **T4.5** Test unitario: reject con claimant activo → `in_progress`; sin claimant → `pending`

---

## Fase 5 — CRUD gaps: Incidents

- [x] **T5.1** Verificar si `deleted_at` existe en tabla `incidents` (revisar migrations 0001-0018)
  - Si no existe: crear migration `0023_add_deleted_at_to_incidents.sql`
  - Añadir `@DeleteDateColumn()` a `IncidentEntity`
- [x] **T5.2** Crear `UpdateIncidentDto` (`title?`, `description?`, `category_id?`)
- [x] **T5.3** Añadir `update(id, dto)` en `IncidentsService` (campos editables solamente)
- [x] **T5.4** Añadir `softDelete(id)` en `IncidentsService`
- [x] **T5.5** Añadir endpoints en `IncidentsController`:
  - `PATCH /incidents/:id` → `update()` con `@RequirePermission('UPDATE')` — DESPUÉS de `PATCH :id/status`
  - `DELETE /incidents/:id` → `softDelete()` con `@RequirePermission('DELETE')`

---

## Fase 6 — CRUD gaps: Assignments + Comments

- [x] **T6.1** Crear `UpdateAssignmentDto` (`operator_id: string`)
- [x] **T6.2** Añadir `update(id, dto)` en `AssignmentsService`
- [x] **T6.3** Añadir `PATCH /assignments/:id` en `AssignmentsController` con `@RequirePermission('UPDATE')`
- [x] **T6.4** Añadir `findOne(id)` en `CommentsService`
- [x] **T6.5** Añadir `update(id, dto, userId)` en `CommentsService` — con ownership check + XSS sanitize (igual que store)
- [x] **T6.6** Crear `UpdateCommentDto` (`content: string`, NotEmpty)
- [x] **T6.7** Añadir endpoints en `CommentsController`:
  - `GET /comments/:id` → `findOne()` con auth
  - `PATCH /comments/:id` → `update()` con auth + ownership en service

---

## Criterios de cierre

- [x] Migrations 0020-0027 aplicadas (0020-0023 schema gaps; 0024+ soft-delete si necesarios)
- [x] `IncidentStatus` type incluye `'closed'`; `closed` NO aparece en `UpdateIncidentStatusDto`
- [x] `GET /roles` lista con permisos por rol
- [x] `PUT /roles/:id/permissions` reemplaza permisos en transacción atómica
- [x] `GET /organizations/tree` devuelve jerarquía anidada
- [x] `POST /notifications/:id/approve` → incidente pasa a `closed`, decision columns escritos, siblings marcados processed
- [x] `POST /notifications/:id/reject` → incidente revierte a `in_progress` (con claimant) o `pending` (sin claimant), reason como Comment de auditoría
- [x] `POST /notifications/:id/approve` con notificación ya procesada → 409
- [x] `PATCH /incidents/:id` acepta title/description/category_id, rechaza status/zone_id
- [x] `DELETE /incidents/:id` retorna 204 y soft-delete
- [x] `PATCH /comments/:id` sanitiza XSS igual que store; 403 si requester ≠ author
- [x] `pnpm test && pnpm run test:e2e` verde sin romper suites existentes
