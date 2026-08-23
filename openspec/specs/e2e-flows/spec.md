# Spec: E2E Flows — T4.1b

**Capability**: e2e-flows  
**Change**: t4.1b-e2e-flows  
**Date**: 2026-08-23  

---

## Flujo 1 — Reporte Anónimo (FL-1)

**FL-1-01 — Reporte dentro de zona**
- **Given** un dispositivo anónimo con `device_uuid: 'anonymous'` hace login
- **When** POST `/api/incidents` con `{ lat: -2.2, lng: -80.5 }` (dentro de Santa Elena)
- **Then** status 201, `zone_id = SANTA_ELENA_ZONE_ID`, `geofence_matched = true`

**FL-1-02 — Reporte fuera de toda zona (R2)**
- **Given** el mismo token anónimo
- **When** POST `/api/incidents` con `{ lat: 10.0, lng: -70.0 }` (fuera de cualquier zona)
- **Then** status 201 (NO rechazado — perder un reporte de emergencia es peor que archivarlo fuera de zona)
- **Then** `zone_id = null`, `geofence_matched = false`

**FL-1-03 — Read-back**
- **Given** el incidente creado en FL-1-01
- **When** GET `/api/incidents/{id}` con el mismo token
- **Then** status 200, body tiene `id` y `title` correctos

---

## Flujo 2 — Anonymous Ceiling CC2 (FL-2)

**FL-2-01 — READ y CREATE permitidos**
- **Given** token anónimo
- **When** GET `/api/incidents` y POST `/api/incidents`
- **Then** ambos responden 200/201

**FL-2-02 — UPDATE de estado rechazado 403**
- **Given** token anónimo con incidente propio
- **When** PATCH `/api/incidents/{id}/status`
- **Then** 403 Forbidden

**FL-2-03 — DELETE de comentario propio rechazado 403**
- **Given** token anónimo, comentario propio
- **When** DELETE `/api/comments/{id}`
- **Then** 403 Forbidden

**FL-2-04 — ASSIGN rechazado 403**
- **Given** token anónimo
- **When** POST `/api/assignments`
- **Then** 403 Forbidden

**FL-2-05 — Sin token rechazado 401**
- **Given** request sin header Authorization
- **When** GET `/api/incidents`
- **Then** 401 Unauthorized

---

## Flujo 3 — Asignación + WebSocket / Streams (FL-3)

**FL-3-01 — Primera asignación exitosa**
- **Given** operator con permisos `CREATE incidents`, `READ incidents`, `ASSIGN assignments`
- **When** POST `/api/assignments` con `{ incident_id, operator_id }`
- **Then** status 201

**FL-3-02 — Segunda asignación conflictua**
- **Given** un segundo operador con `ASSIGN assignments`, mismo incidente ya asignado
- **When** POST `/api/assignments` con mismo `incident_id`
- **Then** status 409 Conflict

**FL-3-03 — Evento en Redis Streams**
- **Given** la asignación exitosa de FL-3-01
- **When** se inspeccionan las últimas 10 entradas de `incidents:events` vía `XREVRANGE`
- **Then** existe un evento de tipo `incident.assigned` con `incidentId` y `operatorId` correctos

---

## Flujo 4 — Ciclo de Comentario + XSS (FL-4)

**FL-4-01 — Payload XSS sanitizado en respuesta**
- **Given** autor con permisos CREATE/READ incidents y CREATE/DELETE comments
- **When** POST `/api/comments` con `content: '<script>alert(1)</script>Sigue bloqueado'`
- **Then** status 201, `body.content` NO contiene `<script>`

**FL-4-02 — XSS sanitizado en la fila de Postgres**
- **Given** el comentario creado en FL-4-01
- **When** se consulta directamente `SELECT content FROM comments WHERE id = $1` via `env.pg.query`
- **Then** la fila no contiene `<script>`, no contiene `<`, y sí contiene `'Sigue bloqueado'`

**FL-4-03 — Non-owner no puede borrar**
- **Given** un stranger con `DELETE comments`
- **When** DELETE `/api/comments/{id}` (comentario de otro user)
- **Then** 403 Forbidden

**FL-4-04 — Owner puede borrar**
- **Given** el autor original del comentario
- **When** DELETE `/api/comments/{id}`
- **Then** 204 No Content

---

## Flujo 5 — Ciclo de Estado + Caché + Streams (FL-5)

**FL-5-01 — Incidente creado en estado `pending`**
- **Given** operador con CREATE/READ/UPDATE incidents
- **When** POST `/api/incidents`
- **Then** `body.status = 'pending'`

**FL-5-02 — Transición fuera de orden rechazada**
- **Given** incidente en `pending`
- **When** PATCH `/api/incidents/{id}/status` con `{ status: 'resolved' }` (salta `in_progress`)
- **Then** 400 Bad Request

**FL-5-03 — Transición legal purga caché**
- **Given** caché de listing `pending` poblado con GET previo (key `incidents:list:{zone_id}:pending:p`)
- **When** PATCH status → `in_progress`
- **Then** status 200, clave de caché `pending` eliminada (`redisCache.get` retorna null)

**FL-5-04 — Segunda transición purga caché in_progress**
- **Given** caché de listing `in_progress` poblado
- **When** PATCH status → `resolved`
- **Then** status 200, `body.status = 'resolved'`, clave `in_progress` eliminada

**FL-5-05 — Estado `resolved` es terminal**
- **Given** incidente en `resolved`
- **When** PATCH status → `in_progress`
- **Then** 400 Bad Request

**FL-5-06 — Dos eventos `incident.status_changed` en el stream**
- **Given** las dos transiciones legales (pending→in_progress, in_progress→resolved)
- **When** `XREVRANGE incidents:events + - COUNT 10`
- **Then** exactamente 2 eventos de tipo `incident.status_changed`
