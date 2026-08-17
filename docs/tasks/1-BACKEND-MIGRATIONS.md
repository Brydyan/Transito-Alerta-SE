# 1: Migraciones de Módulos NestJS del Backend (Fases 1-4)

## Descripción General

Portación de 15 dominios Laravel de GeoReporta a 16 módulos NestJS en 4 fases. Orden de construcción del backend: Infra/esquema → CoreModule → Auth → Incidents (calibración) → dominios restantes. Esfuerzo total: ~6 semanas para un líder backend único (o 2-3 semanas con 2 devs trabajando en lotes paralelos).

## Estado Actual (2026-08-17)

- **Fase 1 (T1.1-T1.5)**: ✅ 100% Completada
  - Scaffold NestJS, config TypeORM (`synchronize: false`), Redis, Auth (device-UUID + JWT), Geofencing
  - 9 suites de prueba, 49 pruebas, todas pasando
  - Migraciones de base de datos 0001-0008 aplicadas a Supabase

- **Fase 2 (T2.0-T2.5)**: ✅ 100% Completada
  - Módulo Geofencing (repositorio PostGIS), Incidents (dominio principal, slice de calibración), Comments, Users, Assignments, Realtime (gateway WebSocket + consumidor Redis Streams)
  - 25+ suites de prueba, 150+ pruebas, todas pasando
  - Migraciones de BD 0003-0007 aplicadas, 0006 creada para columnas de perfil de Users

- **Fase 3 (T3.1-T3.10)**: 🟡 8 de 10 completadas
  - ✅ Completadas: T3.1 (Roles + Permissions), T3.2 (Organizations), T3.3 (Notifications), T3.4 (StatusHistory), T3.5 (Mail), T3.7 (IncidentCategories), T3.8 (Locations), T3.10 (Menus)
  - ⏳ Pendientes: T3.6 (Invitations), T3.9 (Sessions)
  - 2 tareas restantes, ~3 días de esfuerzo
  - **Esquema al día**: 0009-0013 aplicadas a Supabase el 2026-08-16; 0014 y 0015 aplicadas a Supabase y a dev local el 2026-08-17. No queda ninguna pendiente
  - 56 suites unit + 11 E2E, 601 pruebas en verde (499 unit + 102 E2E)
  - ⚠️ El E2E tiene un flake intermitente sin identificar (1 fallo en 4 corridas completas, nunca reproducido). Jest además reporta un handle sin cerrar en todas las corridas — probablemente la misma raíz

- **Fase 4 (T4.1-T4.4)**: ⏳ Planeada
  - 🟡 Parcial: T4.1a (harness E2E completo, T4.1b diferido), T4.1a paso 2 (flujos de workflow + regresiones completadas)
  - ⏳ Pendiente: T4.2 (Load testing), T4.3 (Security hardening), T4.4 (Documentación)

## Estado Fase 3: 2 Tareas Restantes

### T3.2: Módulo Organizations ✅ (COMPLETADA — 2026-08-17)
**Real**: 35 tareas en 9 fases | **Pruebas**: +2 suites E2E, ~24 suites unit tocadas  
**Depende de**: T2.1 (Incidents), T2.3 (Users), T3.1 (Roles)  
**Artefactos**: `openspec/changes/archive/t3.2-organizations/` | Migración 0015

**Qué hace** (según lo entregado, no según lo planeado — ver desviaciones):
- Entidad `Organization`: id, name, zone_id (FK geo_zones), created_at — sin jerarquía ni soft-delete
- Módulo CRUD completo `/api/organizations` + `OrgService.findByZone(zoneId)`, ahora con índice UNIQUE parcial que **impone** el uno-a-uno que el plan solo asumía
- `SubjectScope`: unión discriminada de 5 variantes (`global | org | org_assigned | public | deny`), resuelta por request y pasada como parámetro **obligatorio** a cada repositorio — una llamada sin scope no compila
- Scope aplicado en incidents, comments, assignments, users **y salas de WebSocket**
- Jerarquía de roles: `ROLE_RANK` como constante de código; un actor solo escribe sobre rangos estrictamente inferiores
- `PATCH /users/:id/organization` para asignar organización

**Desviaciones del plan original** (todas deliberadas, justificadas en el proposal archivado):
- **Scoping por `incidents.organization_id`, no por la zona de la org.** R2 exige aceptar incidentes fuera de toda zona; bajo un join por zona esos incidentes no pertenecerían a ninguna org y serían inalcanzables para siempre. Una columna además sobrevive a un redibujo de límites y permite reasignar
- **No existe el permiso `READ cross-org incidents`.** La visibilidad cross-org se obtiene teniendo un rol de sistema. Un flag de permiso sería un segundo eje de autorización paralelo que cada repositorio tendría que consultar; el primero que lo olvide produce una fuga con apariencia de feature
- **El nivel `public` (ciudadano) conserva la lista de incidentes sin filtrar.** No hay módulo de feed: `GET /incidents` *es* el feed público. La frontera de tenant protege datos operativos (asignaciones, staff, salas), no el corpus de incidentes. Consecuencia intencional: el staff de una org ve **menos** incidentes que un ciudadano anónimo
- **Esfuerzo real ~13h contra las 2-3h estimadas.** El plan solo dimensionaba el CRUD; no contemplaba el cierre de fugas, el reshape del caché de auth, los seeds de roles ni el sistema de rangos — nada de lo cual es opcional si el aislamiento ha de ser real

**Criterios de Aceptación**:
- [x] Usuario en Org A consultando incidentes excluye incidentes de Org B (R8)
- [x] Visibilidad cross-org denegada por defecto (vía rol de sistema, no vía permiso)
- [x] Incidente de otra org retorna **404, no 403** — un 403 confirmaría que existe y, por eliminación, que pertenece a otra org
- [x] `operador_organizacion` ve solo los incidentes de su org **asignados a él**
- [x] `admin_organizacion` con `organization_id` NULL ve **cero** incidentes (scope `deny`), no todos
- [x] Socket de Org A que intenta `join org:B` es rechazado y no recibe difusiones de esa sala
- [x] Incidente creado por dispositivo anónimo dentro de la zona de Org A queda con `organization_id = A` — la org deriva de la **jurisdicción**, nunca del autor
- [x] Rango: `admin_organizacion` contra `admin_sistema` → 403 `INSUFFICIENT_ROLE_RANK`; rango igual también bloqueado
- [x] Toda suite E2E preexistente pasa sin modificar (el cambio es aditivo por construcción)

**Deuda registrada**: sin E2E sobre HTTP real para el rank check en `POST /roles/:id/assign` (sí unit); un actor con permisos pero sin rol asignado saltea la escalera de rangos — preexistente, preservado a propósito para no romper identidades actuales.

⚠️ **Operativo**: la frontera está activa pero **inerte**. Todo usuario existente tiene `role_id IS NULL` → scope `public` → conducta de siempre. El aislamiento entra en vigor usuario por usuario al asignar roles staff. **Asignar la organización antes que el rol**: un rol de org sin `organization_id` cae a `deny` y no ve nada.

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

### T3.4: Módulo StatusHistory (Pista de Auditoría) ✅ (COMPLETADA — 2026-08-17)
**Real**: 23 tareas en 6 fases + 1 fix post-verify | **Pruebas**: 27 unit + 12 E2E  
**Depende de**: T2.1 (Incidents)  
**Artefactos**: `openspec/changes/archive/t3.4-status-history/` | Migración 0014

**Qué hace**:
- Entidad `StatusHistory`: id, incident_id (FK CASCADE), `previous_status`, `new_status`, `changed_by_user_id` (FK SET NULL), `event_id` UNIQUE, created_at — solo-append
- Escuchador pasivo sobre Redis Streams, consumer group propio suscrito a `incident.status_changed`, con tabla de decisión ACK y barrido de pendientes
- `getAuditTrail(incidentId)`: historial ordenado (`created_at ASC, id ASC`), forma `{items, total}`
- Sin rutas update/delete — el repositorio expone únicamente `insert()` y `findByIncident()`

**Desviaciones del plan original**:
- **Listener de aplicación, no trigger de Postgres.** GeoReporta usa un trigger `log_incident_status`; acá la auditoría es lógica de aplicación, testeable y visible en el código
- **`event_id` UNIQUE + `ON CONFLICT DO NOTHING`** para idempotencia: una reentrega del stream no duplica la fila. El plan no contemplaba redelivery
- **Nombres**: `previous_status` en vez de `old_status`; `changed_by_user_id` con `ON DELETE SET NULL` para que borrar un usuario no destruya la pista

**Criterios de Aceptación**:
- [x] Cada cambio de status produce fila de historial inmutable (R14)
- [x] Sin rutas update/delete (solo lectura), garantizado por la forma del repositorio
- [x] Cero aristas de importación hacia/desde Incidents (D7 verificado)
- [x] E2E: workflow 3-paso (pending → in_progress → resolved) produce 3 filas de auditoría
- [x] Reentrega del mismo evento no duplica filas
- [x] Lectura de otra org retorna 404 (ver abajo)

⚠️ **Fuga crítica encontrada en verify y corregida**: la lectura del historial validaba solo que el incidente **existiera**, sin filtrar por organización, y el controller nunca leía el scope. Cualquiera con `READ status-history` podía leer la pista de cualquier incidente de cualquier org con solo el UUID. Causa de fondo: T3.4 se especificó **antes** de que existiera T3.2, así que "¿existe este incidente?" era una pregunta de autorización completa en ese momento. **Un chequeo de existencia deja de ser un chequeo de autorización en cuanto hay frontera de tenant.** Corregido con `scopeToSql`, devolviendo 404 y no 403.

**Deuda registrada**: TS-3/TS-4 afirman "no se escribió fila" con un `setTimeout` fijo de 500ms en vez de un poll acotado — forma clásica de aserción negativa frágil.

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

### T3.6: Módulo Invitations ⏳ (PENDIENTE — desbloqueada: T3.1 y T3.5 completadas)
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

### T3.9: Módulo Sessions ⏳ (PENDIENTE)
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

### Actualmente Aplicadas (Supabase): 0001-0015 ✅ (0009-0013 el 2026-08-16; 0014-0015 el 2026-08-17)
### Actualmente Pendientes (no aún aplicadas): ninguna
### Migraciones Fase 3 (planeadas, aún sin escribir): 0016-0017

> ⚠️ **Renumeración**: este documento reservaba 0014 para `invitations` (T3.6) y 0015 para
> `status_history` (T3.4), y no asignaba ningún slot a T3.2. Lo entregado fue **0014 =
> status_history** y **0015 = organizations_scoping**. Luego **T3.9 tomó 0016**, así que
> `invitations` quedó desplazada dos veces y ahora es **0017**.
>
> Las dos aplicadas son independientes entre sí por contrato explícito: ninguna referencia
> objetos de la otra, así que el orden de aplicación no importaba.
>
> **Antes de escribir una migración nueva, mirá `database/MIGRATION_LOG.md`, no esta tabla.**
> El log es la fuente de verdad sobre qué número está tomado; esta tabla es planificación y
> puede quedar atrasada — ya pasó una vez y casi provoca una colisión.

> Fuente de verdad: `database/MIGRATION_LOG.md`. Las migraciones se aplican a mano
> (CC3), así que pasar los tests E2E no dice nada del estado de Supabase — el harness
> corre contra Testcontainers.

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
| 0009 | roles_permissions | tablas roles, permissions | Aplicada | Entidad Role con JSONB permissions, tabla catálogo permissions |
| 0010 | user_email | columna email de users | Aplicada | `users.email` nullable + índice parcial único (para ruteo Mail, T3.5) |
| 0011 | notifications | tabla notifications | Aplicada | id, user_id FK, incident_id FK nullable, type enum, message, data jsonb, read bool, created_at, processed_at + índices |
| 0012 | incident_categories | tabla incident_categories | Aplicada (T3.7) | Adjacency-list uuid, `parent_id` ON DELETE SET NULL, `incidents.category_id` ON DELETE RESTRICT, seed de permisos `incident-categories`. Rollback en `database/rollback/0012_incident_categories.DOWN.sql`. Aplicada a Supabase el 2026-08-16 |
| 0013 | geo_zones_hierarchy | columnas de geo_zones | Aplicada (T3.8) | Añade `parent_id` self-FK + `level` con CHECK `('provincia','canton','parroquia','zona')`, índice, backfill del seed por UUID determinista, y seed de permisos `geo-zones`. Rollback en `database/rollback/0013_geo_zones_hierarchy.DOWN.sql`. Aplicada a Supabase el 2026-08-16 |
| 0014 | status_history | tabla status_history | **Aplicada** (T3.4) | Auditoría solo-append. `incident_id` FK CASCADE, `changed_by_user_id` FK SET NULL, `previous_status`/`new_status` con CHECK contra el vocabulario de estados, `event_id` UNIQUE para inserción idempotente desde Streams, índice `(incident_id, created_at, id)`. Rollback en `database/rollback/0014_status_history.DOWN.sql`. Aplicada a Supabase y dev local el 2026-08-17 |
| 0015 | organizations_scoping | columna de incidents + seeds de roles | **Aplicada** (T3.2) | Índice UNIQUE parcial en `organizations(zone_id)` creado **primero**, para que una anomalía de dos orgs en una zona aborte la migración en vez de asignar incidentes a un tenant arbitrario; `incidents.organization_id` FK SET NULL + índice; backfill por join de zona (los de `zone_id` NULL quedan NULL, estado real y esperado); catálogo de permisos `organizations`; seed de los 4 roles staff (`reporter` ya venía de 0009 y no se toca). Rollback en `database/rollback/0015_organizations_scoping.DOWN.sql`. Aplicada a Supabase y dev local el 2026-08-17 |
| 0016 | sessions_revocation | columnas de `user_sessions` | Planeada (T3.9) | **No crea tabla nueva**: `user_sessions` existe desde 0006 como stub de tracking de dispositivo. 0016 la vuelve portadora de seguridad — `refresh_token_hash`, `previous_refresh_token_hash`, `rotated_at`, `ip_address`, `user_agent`, `revoked_at`, `expires_at`. Ver `openspec/changes/t3.9-sessions/proposal.md` |
| 0017 | invitations | tabla invitations | Planeada (T3.6) | Token single-use. **Renumerada dos veces**: 0014 → 0016 → 0017, porque T3.4 tomó 0014 y T3.9 toma 0016. TTL a definir (GeoReporta usa 48h, este doc decía 24h) |

## Criterios de Éxito

- [x] 10/16 módulos NestJS creados, probados, desplegables (T1.1-T1.5, T2.0-T2.5, T3.1, T3.2, T3.3, T3.4, T3.5, T3.7, T3.8, T3.10)
- [x] 56 suites unit + 11 E2E, 601 pruebas (499 unit + 102 E2E), cobertura 70%+ por módulo
- [x] Migraciones de BD 0001-0015 escritas y aplicadas a Supabase (0014-0015 el 2026-08-17)
- [x] Harness E2E (Testcontainers) funcionando; 11 flujos en verde (Mail, Regressions, Roles, Flows, Health, Notifications, IncidentCategories, GeoZones, Organizations, IncidentsScope, StatusHistory)
- [ ] Load test: 25k usuarios concurrentes, p95 < 200ms, cero conexiones perdidas
- [x] Seguridad: rate limiting ✅, CORS ✅, regresión SQL injection ✅, type safety ✅
- [x] Documentación: README, contrato API, runbook de despliegue ✅
- [x] CI/CD: ESLint ✅, Typecheck ✅, Build ✅, 372 unit tests ✅, 63 E2E tests ✅
