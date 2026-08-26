# Spec: Admin Panel Backend + CRUD Gaps — T5.6

**Capability**: admin-panel-backend
**Change**: t5.6-admin-panel-backend
**Date**: 2026-08-23

---

## Grupo 1 — Roles CRUD

**AP-1-01 — Listar roles**
- **Given** usuario con permiso `READ roles`
- **When** GET `/api/roles`
- **Then** 200, array de roles con `id`, `name`, `permissions[]`

**AP-1-02 — Ver rol por ID**
- **Given** usuario con permiso `READ roles`
- **When** GET `/api/roles/:id`
- **Then** 200, rol con permisos asignados; 404 si no existe

**AP-1-03 — Crear rol**
- **Given** usuario con permiso `CREATE roles`
- **When** POST `/api/roles` con `{ name: string }`
- **Then** 201, rol creado con `id` y `name`

**AP-1-04 — Actualizar rol**
- **Given** usuario con permiso `UPDATE roles`
- **When** PATCH `/api/roles/:id` con `{ name: string }`
- **Then** 200, rol actualizado

**AP-1-05 — Eliminar rol**
- **Given** usuario con permiso `DELETE roles`
- **When** DELETE `/api/roles/:id`
- **Then** 204; 409 si el rol tiene usuarios asignados

**AP-1-06 — Sincronizar permisos de un rol**
- **Given** usuario con permiso `UPDATE roles`
- **When** PUT `/api/roles/:id/permissions` con `{ permissions: string[] }`
- **Then** 200, rol con permisos actualizados (reemplaza completamente el set anterior)

---

## Grupo 2 — Organizations extras

**AP-2-01 — Árbol jerárquico de organizaciones**
- **Given** usuario autenticado con acceso a organizations
- **When** GET `/api/organizations/tree`
- **Then** 200, array raíz con `children[]` anidados recursivamente

**AP-2-02 — Form data para formulario de organización**
- **Given** usuario con permiso `CREATE organizations` o `UPDATE organizations`
- **When** GET `/api/organizations/form-data`
- **Then** 200, `{ roles: Role[], geoZones: GeoZone[] }` — opciones para dropdowns del form

**AP-2-03 — Organizaciones notificadas para un incidente**
- **Given** usuario autenticado
- **When** GET `/api/organizations/notified-for?lat=X&lng=Y`
- **Then** 200, array de organizaciones cuya zona geográfica cubre (lat, lng)

---

## Grupo 3 — Users admin CRUD

**AP-3-01 — Crear usuario por admin**
- **Given** usuario con permiso `CREATE users`
- **When** POST `/api/users` con `{ email, name, role_id, organization_id? }`
- **Then** 201, usuario creado; 409 si email duplicado

**AP-3-02 — Ver perfil de cualquier usuario**
- **Given** usuario con permiso `READ users`
- **When** GET `/api/users/:id`
- **Then** 200, perfil completo del usuario con su rol y organización

**AP-3-03 — Actualizar usuario por admin**
- **Given** usuario con permiso `UPDATE users`
- **When** PATCH `/api/users/:id` con campos a actualizar
- **Then** 200, usuario actualizado

**AP-3-04 — Eliminar/desactivar usuario**
- **Given** usuario con permiso `DELETE users`
- **When** DELETE `/api/users/:id`
- **Then** 204, usuario marcado como inactivo (soft delete)

---

## Grupo 3b — Schema gaps (estado `closed` + decision columns)

**AP-3b-01 — `closed` status existe en DB**
- **Given** migration 0020 aplicada
- **When** `UPDATE incidents SET status='closed' WHERE id=:id`
- **Then** no viola CHECK constraint

**AP-3b-02 — `closed` NO es transición manual vía PATCH**
- **Given** incidente en `resolved`
- **When** PATCH `/api/incidents/:id/status` con `{ status: 'closed' }`
- **Then** 400 Bad Request (no está en `UpdateIncidentStatusDto`)

**AP-3b-03 — Decision columns aceptan null (no decided aún)**
- **Given** incidente sin aprobar/rechazar
- **When** SELECT `approved_by, rejected_by` WHERE `id = :id`
- **Then** ambos son NULL (CHECK XOR no viola)

---

## Grupo 4 — Notifications moderación

**AP-4-01 — Aprobar notificación: incidente pasa a `closed`**
- **Given** usuario con permiso `UPDATE notifications`, incidente en `resolved`, notificación tipo `incident_pending_approval` con `processed_at IS NULL`
- **When** POST `/api/notifications/:id/approve`
- **Then** 200; incidente `status = 'closed'`, `approved_by = actor.id`, `approved_at = now()`; notificación `processed_at = now(), read = true`; siblings del mismo incidente marcados processed

**AP-4-02 — Aprobar dos veces → 409**
- **Given** notificación ya con `processed_at IS NOT NULL`
- **When** POST `/api/notifications/:id/approve` segunda vez
- **Then** 409 Conflict

**AP-4-03 — Rechazar con motivo: revierte a `in_progress` si hay claimant**
- **Given** incidente en `resolved` con `claimed_by` activo, notificación decidible
- **When** POST `/api/notifications/:id/reject` con `{ reason: "Motivo largo suficiente" }`
- **Then** 200; incidente `status = 'in_progress'`, `rejected_by/at/reason` escritos; Comment de auditoría creado con el reason

**AP-4-04 — Rechazar sin claimant: revierte a `pending`**
- **Given** incidente en `resolved` con `claimed_by = null`
- **When** POST `/api/notifications/:id/reject` con reason válido
- **Then** 200; incidente `status = 'pending'`

**AP-4-05 — Rechazar con reason < 10 chars → 422**
- **Given** usuario con permiso de moderación
- **When** POST reject con `{ reason: "corto" }`
- **Then** 422 Unprocessable Entity

**AP-4-06 — 403 sin permisos de moderación**
- **Given** usuario sin permiso `UPDATE notifications`
- **When** POST approve o reject
- **Then** 403 Forbidden

---

## Grupo 5 — CRUD gaps: Incidents

**AP-5-01 — Actualizar incidente**
- **Given** usuario con permiso `UPDATE incidents`
- **When** PATCH `/api/incidents/:id` con campos `{ title?, description?, category_id? }`
- **Then** 200, incidente actualizado; 403 si sin permiso; 404 si no existe

**AP-5-02 — Eliminar incidente (admin)**
- **Given** usuario con permiso `DELETE incidents`
- **When** DELETE `/api/incidents/:id`
- **Then** 204; 403 si sin permiso `DELETE incidents`

---

## Grupo 6 — CRUD gaps: Assignments

**AP-6-01 — Actualizar asignación**
- **Given** usuario con permiso `UPDATE assignments`
- **When** PATCH `/api/assignments/:id` con `{ operator_id: string }`
- **Then** 200, asignación actualizada con nuevo operador; 404 si asignación no existe

---

## Grupo 7 — CRUD gaps: Comments

**AP-7-01 — Ver comentario individual**
- **Given** usuario autenticado
- **When** GET `/api/comments/:id`
- **Then** 200, comentario con `id`, `content`, `author`, `incident_id`; 404 si no existe

**AP-7-02 — Actualizar contenido de comentario**
- **Given** usuario propietario del comentario
- **When** PATCH `/api/comments/:id` con `{ content: string }`
- **Then** 200, comentario actualizado; 403 si no es propietario; XSS sanitizado igual que en store
