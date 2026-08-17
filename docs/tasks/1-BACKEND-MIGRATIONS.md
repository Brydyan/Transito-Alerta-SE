# 1: Migraciones de Módulos NestJS del Backend (Fases 1-4)

## Descripción General

Portación de 15 dominios Laravel de GeoReporta a 16 módulos NestJS en 4 fases. Orden de construcción del backend: Infra/esquema → CoreModule → Auth → Incidents (calibración) → dominios restantes. Esfuerzo total: ~6 semanas para un líder backend único (o 2-3 semanas con 2 devs trabajando en lotes paralelos).

## Estado Actual (2026-08-16)

- **Fase 1 (T1.1-T1.5)**: ✅ 100% Completada
  - Scaffold NestJS, config TypeORM (`synchronize: false`), Redis, Auth (device-UUID + JWT), Geofencing
  - 9 suites de prueba, 49 pruebas, todas pasando
  - Migraciones de base de datos 0001-0008 aplicadas a Supabase

- **Fase 2 (T2.0-T2.5)**: ✅ 100% Completada
  - Módulo Geofencing (repositorio PostGIS), Incidents (dominio principal, slice de calibración), Comments, Users, Assignments, Realtime (gateway WebSocket + consumidor Redis Streams)
  - 25+ suites de prueba, 150+ pruebas, todas pasando
  - Migraciones de BD 0003-0007 aplicadas, 0006 creada para columnas de perfil de Users

- **Fase 3 (T3.1-T3.10)**: 🟡 ~88% Completada
  - ✅ Completadas: T3.1 (Roles + Permissions), T3.10 (Menus), T3.5 (Mail), T3.3 (Notifications), T3.7 (IncidentCategories), T3.8 (Locations)
  - 🟡 En Progreso / Pendiente: T3.2 (Organizations), T3.4 (StatusHistory), T3.6 (Invitations), T3.9 (Sessions)
  - 4 tareas restantes, ~6-7 días de esfuerzo

- **Fase 4 (T4.1-T4.4)**: ⏳ Planeada
  - 🟡 Parcial: T4.1a (harness E2E completo, T4.1b diferido), T4.1a paso 2 (flujos de workflow + regresiones completadas)
  - ⏳ Pendiente: T4.2 (Load testing), T4.3 (Security hardening), T4.4 (Documentación)

## Estado Fase 3: 7 Tareas Restantes

### T3.2: Módulo Organizations 🟡 (EN PROGRESO)
**Tamaño PR**: ~180 LOC | **Pruebas**: 4 unit + 2 e2e | **Duración**: 2-3h  
**Depende de**: T2.1 (Incidents), T2.3 (Users), T3.1 (Roles)

**Qué hace**:
- Entidad `Organization`: id, name, zone_id (FK geo_zones), created_at
- `OrgService.findByZone(zoneId)`: búsqueda de org por zona (uno-a-uno para MVP)
- Consultas de incidentes con scope: usuarios ven solo incidentes en la zona de su org a menos que se les otorgue permiso `READ cross-org incidents`
- `list()`: vista de admin paginada de todas las orgs

**Criterios de Aceptación**:
- [ ] Usuario en Org A consultando incidentes excluye incidentes de Org B (R8)
- [ ] Visibilidad cross-org denegada por defecto; permiso explícito requerido
- [ ] Org inexistente retorna 404

### T3.3: Módulo Notifications ✅ (COMPLETADA EN ESTA SESIÓN)
**Depende de**: T2.1, T3.5 (Mail debe existir primero)

**Qué hace**:
- Entidad `Notification`: id, user_id (FK), incident_id (FK nullable), type (enum), message, data (jsonb), read (bool), created_at, processed_at
- Escuchador pasivo (IncidentNotificationsListener): @OnEvent para `incident.created`, `incident.assigned`, `incident.status_changed`, `comment.added`
- Redis Pub/Sub: publicar a canal `user:{id}:notifications` para entrega en tiempo real (frontend vía Socket.io)
- Deduplicación: ventana de 60s por (user_id, type, incident_id) para prevenir spam de cascadas de eventos
- Rutas HTTP: GET `/api/notifications` (lista), GET `/api/notifications/unread` (contador), PATCH `/:id/read`, PATCH `/read-all`

**Criterios de Aceptación**:
- ✅ Notificaciones creadas por listeners pasivos sin importar Incidents (D7 pattern)
- ✅ Deduplicación: eventos rápidos eliminan duplicados (60s window)
- ✅ Redis Pub/Sub para entrega async en tiempo real
- ✅ Índices en (user_id, created_at) y (user_id, read) para queries rápidas
- ✅ E2E tests verifican crear, dedup, marcar-leído, contar sin-leer

### T3.4: Módulo StatusHistory (Pista de Auditoría) 🟡 (EN PROGRESO)
**Depende de**: T2.1 (Incidents)

**Qué hace**:
- Entidad `StatusHistory`: id, incident_id (FK), old_status, new_status, changed_by_user_id, created_at — solo-append
- Escuchador pasivo: EventEmitter2/Streams consumer group `status-history` se suscribe a stream `incident.status_changed`
- `getAuditTrail(incidentId)`: retorna historial ordenado (más antiguo → más nuevo)
- Sin rutas update/delete (auditoría inmutable)

**Criterios de Aceptación**:
- [ ] Cada cambio de status produce fila de historial inmutable (R14)
- [ ] Sin rutas update/delete (solo lectura)
- [ ] Cero aristas de importación hacia/desde Incidents (D7 verificado)
- [ ] E2E: workflow 3-paso (pending → in_progress → resolved) produce 3 filas de auditoría

### T3.5: Módulo Mail ✅ (COMPLETADA EN ESTA SESIÓN)
**Depende de**: T1.1 (Config)

**Qué hace**:
- Envoltorio de cliente SMTP (nodemailer)
- Redis Streams `mail:outbox` + consumer group (D8 — conexión blocking dedicada)
- Envío templated: invitaciones, notificaciones, password-reset (si es necesario)
- Reintentos via XPENDING/XCLAIM sweep: 3 intentos, luego DLQ `mail:dead`
- Registro de falla (nunca silent drop, R13)

**Criterios de Aceptación**:
- [x] Envío exitoso registrado con ID de entrada
- [x] Envío fallido registrado con contexto diagnóstico (R13)
- [x] Renderizado de template con interpolación de variable + escape de contenido de usuario (R3)
- [x] Entradas estancadas reclamadas y reintentadas después de 30s inactiva (sweep XPENDING)
- [x] Dead-letter después de 3 intentos

### T3.6: Módulo Invitations 🟡 (BLOQUEADA en T3.5, T3.1)
**Depende de**: T3.1 (Roles), T3.5 (Mail)

**Qué hace**:
- Entidad `Invitation`: id, email, role_id (FK), token (single-use), expires_at (24h), used_at, created_by_user_id
- Endpoint admin `POST /api/admin/users/invite`: valida permiso `INVITE users`, crea fila de invitación, envía email via T3.5
- Redención: `POST /api/auth/accept-invitation {token}`: verifica token no expirado/ya-usado, crea fila de usuario, asigna rol, marca `used_at`
- `GET /api/invitations/pending`: lista todas las invitaciones pendientes (solo admin)

**Criterios de Aceptación**:
- [ ] Redención de token expirado rechazada (R12)
- [ ] Token single-use (segunda redención falla, invitación aún marcada como usada)
- [ ] Nuevo usuario obtiene rol invitado (no reporter por defecto)
- [ ] Email enviado a dirección invitada (mockeado en unit, real en e2e)

### T3.7: Módulo IncidentCategories ✅ (COMPLETADA)
**Depende de**: T2.1 (Incidents)

**Qué hace**:
- Entidad `IncidentCategory`: id (uuid), name, parent_id (FK self, nullable, ON DELETE SET NULL) — adjacency list plana
- `getSubtree(rootId)`: CTE recursiva (`WITH RECURSIVE`) retorna subtree completo a cualquier profundidad; `buildTree()` arma el anidado en memoria (función pura)
- `list(filters)`: paginada con filtros `search` (ILIKE) y `parent_id` (incluye `null` = solo raíces)
- `create()` / `update()`: guard de ciclos por ancestor-walk (rechaza self-parent y re-parent a descendiente)
- Wire `incidents.category_id` FK (ON DELETE RESTRICT) — solo esquema en esta tarea, sin wiring de DTO/service

**Criterios de Aceptación**:
- [x] Consultar parent retorna subtree completo (R10), no solo hijos directos — CTE recursiva, no eager-load de 2 niveles como Laravel
- [x] Referencias circulares rechazadas en write (ancestor-walk, 400) — cierra un gap que Laravel nunca resolvió
- [x] E2E: jerarquía anidada 3-niveles profunda, consultar root retorna todos los descendientes
- [x] Borrar categoría referenciada por un incidente → 409 (PG 23503 mapeado)
- [x] Borrar padre promueve hijos a raíz (SET NULL), no cascada
- [x] Permisos CREATE/UPDATE/DELETE con recurso `incident-categories` (hyphenated, por `inferResourceFromPath`)

**Fuera de alcance (decisiones registradas en SDD)**:
- Org-scoping M:N de categorías (Laravel lo tiene; spec NestJS no lo pide — acopla con T3.2 sin construir)
- Constraint leaf-only para incidentes (pertenece al dominio Incidents, patrón D7)
- Soft deletes (ninguna entidad del stack NestJS los usa)

**Artefactos SDD**: `openspec/changes/t3.7-incident-categories/` (design.md, tasks.md) + Engram `sdd/t3.7-incident-categories/*`

### T3.8: Módulo Locations (CRUD Geo Zones) ✅ (COMPLETADA)
**Depende de**: T2.0 (Geofencing), T2.1 (Incidents)

**Qué hace**:
- Admin CRUD sobre la tabla `geo_zones` **ya existente** (migración 0002) — no se creó tabla `locations` nueva
- Migración 0013: añade `parent_id` (self-FK) y `level` con CHECK `('provincia','canton','parroquia','zona')`, más el backfill del seed
- `POST /api/geo-zones`: acepta GeoJSON, coerciona `Polygon` → `MultiPolygon` vía `ST_Multi`, valida con `ST_IsValid`
- `PATCH /api/geo-zones/{id}`: valida límite y purga el caché de puntos (CC5)
- `DELETE /api/geo-zones/{id}`: marca `active = false`; la fila sobrevive y los hijos siguen activos
- `GET /api/geo-zones/tree`: CTE recursiva con tope de profundidad; guard de ciclos por ancestor-walk

**Criterios de Aceptación**:
- [x] Editar límite purga caché tagged; siguiente búsqueda refleja límite nuevo (CC5)
- [x] Escritura de polígono inválido rechazada con mensaje diagnóstico (`ST_IsValidReason` verbatim)
- [x] E2E: reducir zona, re-enviar incidente en borde previo → ahora fuera
- [x] Jerarquía provincia → cantón con backfill verificado del seed sembrado
- [x] Desactivar un padre no cascadea a los hijos

**Desvíos deliberados del texto de esta tarea** (decisión del usuario, registrados en el proposal):
- Ruta `geo-zones`, no `/api/admin/locations`: ningún otro controller usa prefijo `admin/`, e `inferResourceFromPath` derivaría el recurso `admin`, rompiendo el patrón de los demás
- Borrado con `active=false` en vez de soft-delete nuevo: las FK son `ON DELETE SET NULL`, así que un borrado real desligaría organizaciones e incidentes en silencio; y ninguna entidad del stack usa soft deletes

**Corrección de fondo incluida**: `purgeZoneCache()` no alcanzaba el caché de puntos `geo:point:{lat}:{lng}` (TTL 60s) porque esas claves nunca se etiquetaban — CC5 era falso durante hasta un minuto tras editar un límite. Resuelto con un tag-set dedicado `geo:tags:points`, con test de regresión que impide volver a mezclarlo con `ALL_ZONES_TAG` (que `incidents.service.ts` purga en cada escritura).

**Artefactos SDD**: `openspec/changes/archive/t3.8-locations/` + Engram `sdd/t3.8-locations/*`

### T3.9: Módulo Sessions 🟡 (EN PROGRESO)
**Depende de**: T1.4 (Auth)

**Qué hace**:
- Entidad `Session`: id, jti (único, FK auth.jti), user_id, device_info (JSON: browser/OS/IP), issued_at, revoked_at, last_activity_at
- En refresh: actualizar last_activity_at (rastrear sesiones activas)
- Endpoint de revocación: `DELETE /api/me/sessions/{sessionId}`: establece revoked_at; siguiente refresh con ese jti rechazado (R15)
- Endpoint de lista: `GET /api/me/sessions`: retorna todas las sesiones del usuario (con info de dispositivo) para auditoría de historial de login
- Limpieza automática: eliminar sesiones revocadas más antiguas que 90 días (cron job, no crítico para MVP)

**Criterios de Aceptación**:
- [ ] Refresh token revocado rechazado en siguiente uso (R15)
- [ ] Revocación inmediata (sin lag de TTL)
- [ ] E2E: login en dispositivo A, revocar sesión, token de dispositivo A rechazado, token de dispositivo B aún funciona

## Auditoría de Migración de Base de Datos

### Actualmente Aplicadas (Supabase): 0001-0008, 0010-0011
### Actualmente Pendientes (no aún aplicadas): 0009, 0012, 0013
### Migraciones Fase 3 (escritas/planeadas): 0011-0016

| ID | Nombre | Entidad | Estado | Notas |
|----|------|--------|--------|-------|
| 0001 | initial_schema | users, organizations | Aplicada | Tabla Roles + columna permissions agregada en 0009 |
| 0002 | add_postgis_and_geo_zones | geo_zones | Aplicada | Requiere creación manual de extensión PostGIS en Supabase |
| 0003 | seed_geo_zones | datos geo_zones | Aplicada | Polígono Santa Elena sembrado |
| 0004 | incidents | tabla incidents | Aplicada | Renumerada (originalmente 0003) |
| 0005 | comments | tabla comments | Aplicada | Renumerada (originalmente 0004) |
| 0006 | users | columnas de perfil de users | Aplicada | Nuevo slot (originalmente sin declarar) para first_name, last_name, avatar_url |
| 0007 | assignments | tabla assignments | Aplicada | Renumerada (originalmente 0006) |
| 0008 | anonymous_read_comments | roles_permissions | Aplicada | Agrega grant de techo de anonymous reporter |
| 0009 | roles_permissions | tablas roles, permissions | Pendiente | Entidad Role con JSONB permissions, tabla catálogo permissions |
| 0010 | user_email | columna email de users | Aplicada | `users.email` nullable + índice parcial único (para ruteo Mail, T3.5) |
| 0011 | notifications | tabla notifications | Aplicada | id, user_id FK, incident_id FK nullable, type enum, message, data jsonb, read bool, created_at, processed_at + índices |
| 0012 | incident_categories | tabla incident_categories | Escrita (T3.7) | Adjacency-list uuid, `parent_id` ON DELETE SET NULL, `incidents.category_id` ON DELETE RESTRICT, seed de permisos `incident-categories`. Rollback en `database/rollback/0012_incident_categories.DOWN.sql`. Pendiente de aplicar a Supabase |
| 0013 | geo_zones_hierarchy | columnas de geo_zones | Escrita (T3.8) | Añade `parent_id` self-FK + `level` con CHECK `('provincia','canton','parroquia','zona')`, índice, backfill del seed por UUID determinista, y seed de permisos `geo-zones`. Rollback en `database/rollback/0013_geo_zones_hierarchy.DOWN.sql`. Pendiente de aplicar a Supabase |
| 0014 | invitations | tabla invitations | Planeada (T3.6) | Token single-use, expiración 24h |
| 0015 | status_history | tabla status_history | Planeada (T3.4) | Auditoría solo-append |
| 0016 | sessions | tabla sessions | Planeada (T3.9) | Seguimiento JWT + revocación |

## Criterios de Éxito

- [x] 8/16 módulos NestJS creados, probados, desplegables (T1.1-T1.5, T2.0-T2.5, T3.1, T3.3, T3.5, T3.7, T3.8, T3.10)
- [x] 44 suites unit + 8 E2E, 435 pruebas (372 unit + 63 E2E), cobertura 70%+ por módulo
- [x] Migraciones de BD 0001-0013 escritas; 0001-0008 y 0010-0011 aplicadas a Supabase; 0009, 0012 y 0013 pendientes
- [x] Harness E2E (Testcontainers) funcionando; 8 flujos en verde (Mail, Regressions, Roles, Flows, Health, Notifications, IncidentCategories, GeoZones)
- [ ] Load test: 25k usuarios concurrentes, p95 < 200ms, cero conexiones perdidas
- [x] Seguridad: rate limiting ✅, CORS ✅, regresión SQL injection ✅, type safety ✅
- [x] Documentación: README, contrato API, runbook de despliegue ✅
- [x] CI/CD: ESLint ✅, Typecheck ✅, Build ✅, 372 unit tests ✅, 63 E2E tests ✅
