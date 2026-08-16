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

- **Fase 3 (T3.1-T3.10)**: 🟡 ~75% Completada
  - ✅ Completadas: T3.1 (Roles + Permissions), T3.10 (Menus), T3.5 (Mail)
  - 🟡 En Progreso / Pendiente: T3.2 (Organizations), T3.3 (Notifications), T3.4 (StatusHistory), T3.6 (Invitations), T3.7 (IncidentCategories), T3.8 (Locations), T3.9 (Sessions)
  - 7 tareas restantes, ~2 semanas de esfuerzo

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

### T3.3: Módulo Notifications 🟡 (BLOQUEADA en T3.5)
**Depende de**: T2.1, T3.5 (Mail debe existir primero)

**Qué hace**:
- Entidad `Notification`: id, user_id (FK), type (email/telegram/push), related_incident_id, is_read, created_at
- Escuchador pasivo: EventEmitter2/Streams consumer group `notifications` se suscribe a `incident.created`/`incident.assigned`
- Trabajos de Bull queue: entrega async (email via T3.5, Telegram via Bot API)
- Deduplicación: por evento+canal (sin envíos duplicados)
- Marcar como leído: `PATCH /api/notifications/{id}/read`

**Criterios de Aceptación**:
- [ ] Usuario con email + Telegram recibe ambos canales para evento crítico (R9), sin duplicados
- [ ] Entrega completamente async (nunca bloquea solicitud disparadora)
- [ ] Módulo Notifications tiene cero importaciones de Incidents (D7 — verificado via jest moduleGraph)
- [ ] Contador de no leídos en sidebar correcto después de marcar como leído

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
- [ ] Envío exitoso registrado con ID de entrada
- [ ] Envío fallido registrado con contexto diagnóstico (R13)
- [ ] Renderizado de template con interpolación de variable + escape de contenido de usuario (R3)
- [ ] Entradas estancadas reclamadas y reintentadas después de 30s inactiva (sweep XPENDING)
- [ ] Dead-letter después de 3 intentos

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

### T3.7: Módulo IncidentCategories 🟡 (EN PROGRESO)
**Depende de**: T2.1 (Incidents)

**Qué hace**:
- Entidad `IncidentCategory`: id, name, parent_id (FK self, nullable) — adjacency list
- `getSubtree(parentId)`: consulta CTE recursiva retorna parent + todos los descendientes (R10)
- `list()`: todas las categorías (plana)
- `create()`: nueva categoría con parent opcional
- Wire `Incident.category_id` FK (opcional, reportes pueden ser sin categorizar)

**Criterios de Aceptación**:
- [ ] Consultar parent retorna subtree completo (R10), no solo hijos directos
- [ ] Referencias circulares rechazadas en write (consultar ancestor_id en ruta descendiente)
- [ ] E2E: jerarquía anidada 3-niveles profunda, consultar root retorna todos los 7 descendientes

### T3.8: Módulo Locations (CRUD Geo Zones) 🟡 (EN PROGRESO)
**Depende de**: T2.0 (Geofencing), T2.1 (Incidents)

**Qué hace**:
- Admin CRUD sobre `geo_zones` (crear/actualizar/eliminar polígonos límites)
- `POST /api/admin/locations`: validar permiso `CREATE locations`, aceptar GeoJSON/WKT, crear fila
- `PATCH /api/admin/locations/{id}`: validar límite (ST_IsValid), purgar caché `geo:tags:{zone_id}` (escenario CC5), actualizar columna `geom`
- `DELETE /api/admin/locations/{id}`: archivar (soft-delete) para pista de auditoría

**Criterios de Aceptación**:
- [ ] Editar límite purga caché tagged; siguiente búsqueda refleja límite nuevo (CC5)
- [ ] Escritura de polígono inválido rechazada con mensaje diagnóstico
- [ ] E2E: reducir zona Santa Elena, re-enviar incidente en borde previo → ahora fuera

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

### Actualmente Aplicadas (Supabase): 0001-0008
### Actualmente Pendientes (no aún aplicadas): 0009-0010
### Migraciones Fase 3 (planeadas): 0011-0016

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
| 0010 | user_email | columna email de users | Pendiente | `users.email` nullable + índice parcial único (para ruteo Mail, T3.5) |
| 0011 | incident_categories | tabla incident_categories | Planeada (T3.7) | Jerarquía adjacency-list |
| 0012 | invitations | tabla invitations | Planeada (T3.6) | Token single-use, expiración 24h |
| 0013 | status_history | tabla status_history | Planeada (T3.4) | Auditoría solo-append |
| 0014 | locations | triggers CRUD geo_zones | Planeada (T3.8) | Invalidación de caché en edición de zona |
| 0015 | sessions | tabla sessions | Planeada (T3.9) | Seguimiento JWT + revocación |
| 0016 | mail | (sin nueva tabla) | Planeada (T3.5) | Solo config (templates de email almacenados en filesystem o env vars) |

## Criterios de Éxito

- [ ] Todos los 16 módulos NestJS creados, probados, desplegables
- [ ] 200+ suites de prueba, 1000+ pruebas, 70%+ cobertura por módulo
- [ ] Migraciones de BD 0001-0016 escritas + 0001-0010 aplicadas a Supabase
- [ ] Harness E2E (Testcontainers) funcionando; 4 flujos principales en verde
- [ ] Load test: 25k usuarios concurrentes, p95 < 200ms, cero conexiones perdidas
- [ ] Seguridad: rate limiting ✅, CORS ✅, regresión SQL injection ✅
- [ ] Documentación: README, contrato API, runbook de despliegue ✅
