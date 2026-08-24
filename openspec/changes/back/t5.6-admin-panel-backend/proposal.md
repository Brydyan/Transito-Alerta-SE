# Proposal: T5.6 — Admin Panel Backend + CRUD Gaps

**Change**: t5.6-admin-panel-backend
**Author**: Claude (Architect role)
**Date**: 2026-08-23
**Priority**: Alta — bloquea funcionalidad de administración y cierra gaps de CRUD detectados en auditoría

---

## Intent

Auditoría exhaustiva de `GeoReporta/backend/routes/api.php` vs NestJS TASE (2026-08-23)
reveló dos categorías de endpoints faltantes no cubiertos en T5.1-T5.5:

**Categoría A — Admin panel backend** (gestión de roles, usuarios, organizaciones, moderación):
GeoReporta expone CRUD completo de roles, gestión de usuarios por admin, variantes de
endpoints de organizaciones y un flujo de aprobación/rechazo de notificaciones. El NestJS
actual solo tiene lista de roles y asignación, sin posibilidad de crear/editar/eliminar roles
ni configurar sus permisos.

**Categoría B — CRUD incompleto en módulos existentes** (incidents, comments, assignments):
Los módulos existentes solo tienen los endpoints de lectura y creación implementados. Las
operaciones de actualización y eliminación (que sí existen en GeoReporta) nunca se portaron.

La auditoría también confirmó que el dominio `Locations` (jerarquía administrativa
country/province/city/neighborhood) es una **eliminación intencional**: TASE reemplaza
la jerarquía admin con geofencing + geo-zones. Documentado en 1-BACKEND-MIGRATIONS.md.

---

## Scope

### Admin panel (Categoría A)

| Endpoint | Controller destino |
|----------|--------------------|
| `GET/POST/PATCH/DELETE /roles` | RolesController (nuevo CRUD) |
| `PUT /roles/:id/permissions` | RolesController (syncPermissions) |
| `GET /organizations/tree` | OrganizationsController |
| `GET /organizations/form-data` | OrganizationsController |
| `GET /organizations/notified-for` | OrganizationsController |
| `POST /users` | UsersController (admin create) |
| `GET /users/:id` | UsersController (admin show) |
| `PATCH /users/:id` | UsersController (admin update) |
| `DELETE /users/:id` | UsersController (soft delete) |
| `POST /notifications/:id/approve` | NotificationsController |
| `POST /notifications/:id/reject` | NotificationsController |

### CRUD gaps (Categoría B)

| Endpoint | Controller destino |
|----------|--------------------|
| `PATCH /incidents/:id` | IncidentsController (update fields) |
| `DELETE /incidents/:id` | IncidentsController (admin delete) |
| `PATCH /assignments/:id` | AssignmentsController (update) |
| `GET /comments/:id` | CommentsController (show) |
| `PATCH /comments/:id` | CommentsController (update content) |

**Fuera de scope**:
- `locations` admin hierarchy → eliminación intencional documentada, no implementar

### Categoría C — Schema gaps (confirmados en segunda auditoría 2026-08-23)

| Gap | Detalle |
|-----|---------|
| Estado `closed` en incidents | GeoReporta: `pending→in_progress→resolved→closed`. NestJS solo tiene 3 estados. Falta tipo, transición, DTO, CHECK constraint |
| Decision columns en incidents | `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason` + 3 CHECK constraints + partial index |
| NotificationType `incident_pending_approval` | Dispara el flujo de aprobación admin. Ausente del enum NestJS |
| `notes` en `status_history` | Campo para motivos de rechazo. Ausente de `StatusHistoryEntity` |

Estas migrations son prerrequisito para las Categorías A (approve/reject) y se implementan como parte de T5.6.

---

## Approach

- Roles CRUD: añadir index/show/store/update/destroy a `RolesController`. Nuevo endpoint
  `PUT :id/permissions` llama a `RolesService.syncPermissions()` que ya debe existir o
  se crea análogo al patrón de T2.4 (PermissionGuard + RequirePermission)
- Organizations extras: 3 métodos en `OrganizationsController` + servicio. `tree()` agrega
  relaciones jerárquicas. `formData()` retorna roles disponibles + zones. `notifiedFor()`
  filtra orgs cuya zona cubre las coordenadas del incidente
- Users admin: los endpoints self-management (`/me`, `/me/avatar`) ya existen. Faltan los
  endpoints de gestión admin sobre otros usuarios — mismos DTOs pero con `@RequirePermission`
  sobre `users`
- Notifications approve/reject: aprobar → dispara transición de estado del incidente y marca
  notificación. Rechazar → revierte estado + guarda razón. Patrón análogo al
  `IncidentWorkflowController` de T5.1
- CRUD gaps: añadir métodos faltantes a controllers existentes. Incidents update/delete
  requieren `@RequirePermission('UPDATE')`/`('DELETE')`. Comments show/update son públicos
  para el propietario

---

## Criterios de aceptación

- `GET /roles` lista roles paginados con sus permisos
- `PUT /roles/:id/permissions` actualiza permisos del rol y retorna rol actualizado
- `GET /organizations/tree` retorna árbol jerárquico de organizaciones
- `POST /notifications/:id/approve` + reject completan el flujo de moderación
- `PATCH /incidents/:id` permite editar title/description/category_id
- `DELETE /incidents/:id` requiere permiso DELETE incidents y retorna 204
- `pnpm test && pnpm run test:e2e` verde sin romper suites existentes
