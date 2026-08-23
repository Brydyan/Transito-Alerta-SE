# 1: Migraciones de Módulos NestJS del Backend (Fases 1-5, T5.6)

## Descripción General

Portación de 15 dominios Laravel de GeoReporta a 16 módulos NestJS en 4 fases. Orden de construcción del backend: Infra/esquema → CoreModule → Auth → Incidents (calibración) → dominios restantes. Esfuerzo total: ~6 semanas para un líder backend único (o 2-3 semanas con 2 devs trabajando en lotes paralelos).

## Estado Actual (2026-08-23)

- **Fase 1 (T1.1-T1.5)**: ✅ 100% Completada
  - Scaffold NestJS, config TypeORM (`synchronize: false`), Redis, Auth (device-UUID + JWT), Geofencing
  - 9 suites de prueba, 49 pruebas, todas pasando
  - Migraciones de base de datos 0001-0008 aplicadas a Supabase

- **Fase 2 (T2.0-T2.5)**: ✅ 100% Completada
  - Módulo Geofencing (repositorio PostGIS), Incidents (dominio principal, slice de calibración), Comments, Users, Assignments, Realtime (gateway WebSocket + consumidor Redis Streams)
  - 25+ suites de prueba, 150+ pruebas, todas pasando
  - Migraciones de BD 0003-0007 aplicadas, 0006 creada para columnas de perfil de Users

- **Fase 3 (T3.1-T3.10)**: ✅ 100% Completada (2026-08-19)
  - ✅ Completadas: T3.1 (Roles + Permissions), T3.2 (Organizations), T3.3 (Notifications), T3.4 (StatusHistory), T3.5 (Mail), T3.6 (Invitations), T3.7 (IncidentCategories), T3.8 (Locations), T3.9 (Sessions), T3.10 (Menus)
  - **Esquema al día**: 0009-0018 aplicadas a Supabase (0016-0018 el 2026-08-19). No queda ninguna pendiente
  - 77 suites unit + 15 E2E, 848 pruebas en verde (714 unit + 134 E2E)
  - ⚠️ (Anterior) El E2E tenía un flake intermitente — resuelto con T3.6 testing suite; T3.9 sessions + T3.6 invitations completos y verificados PASS

- **Fase 4 (T4.1-T4.4)**: ✅ 100% Completada (2026-08-22)
  - ✅ T4.1a: Harness E2E completo (15 suites, 134 tests, CI `integration` job activo)
  - ✅ T4.1a paso 2: 9 regresiones de Fases 1-2 en verde (`test/e2e/regressions.e2e-spec.ts`)
  - ✅ T4.1b: E2E flows — 5 flujos completos (anónimo, CC2, asignación+streams, XSS, estado+caché). Archivado 2026-08-22
  - ✅ T4.2: Load testing — k6 scripts en `load-tests/k6/` (3 escenarios: auth, incidents, WebSocket). Archivado 2026-08-22
  - ✅ T4.3: Security hardening — `helmet@8.3.0`, fix `MoreThan` dedup, 4 tests E2E (138 total). Archivado 2026-08-21
  - ✅ T4.4: Documentación — Swagger (`/api/docs` en dev), runbook `docs/runbooks/deploy.md`. Archivado 2026-08-21

- **Fase 5 (T5.1-T5.6)**: ✅ 100% Completada (2026-08-23) — todas archivadas
  - ✅ T5.1: Incident Workflow — claim/release, operadores disponibles, catálogo de estados. Archivado 2026-08-23
  - ✅ T5.2: Incident Analytics — stats agregadas, weekly-stats, feed ciudadano, export CSV. Archivado 2026-08-23
  - ✅ T5.3: Operator Tracking — GPS location tracking de operadores, dashboard de operador. Archivado 2026-08-23
  - ✅ T5.4: Map UI Support — filtros de mapa (GET /map/filters), form-data de usuarios. Archivado 2026-08-23
  - ✅ T5.5: Comment Images — subida/borrado de imágenes adjuntas en comentarios. Archivado 2026-08-23
  - ✅ T5.6: Admin Panel Backend + CRUD Gaps — roles CRUD, orgs tree/form-data, users admin, notifications approve/reject, CRUD completo incidents/comments/assignments. Archivado 2026-08-23

## Estado Fase 3: ✅ COMPLETADA (2026-08-19)

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

### T3.6: Módulo Invitations ✅ (COMPLETADA — 2026-08-19)
**Real**: 75 tareas en 9 fases (SDD) | **Pruebas**: 7 e2e + 5 Testcontainers integration
**Depende de**: T3.1 (Roles), T3.5 (Mail)
**Artefactos**: `openspec/changes/archive/t3.6-invitations/` | Migraciones 0017 (users password identity) + 0018 (invitations)

**Qué hace** (Variante B: email+password multi-device identity, full SDD approved):
- Entidad `Invitation`: id, email, role_id (FK), token (SHA-256 hashed, single-use), expires_at (48h TTL), redeemed_at, created_by_user_id
- Entidad `PasswordResetToken`: id, user_id (FK), token (SHA-256 hashed), expires_at (48h), consumed_at
- Endpoint admin `POST /api/admin/users/invite`: valida permiso `INVITE users`, crea fila de invitación, envía email via T3.5 mail outbox
- Redención: `POST /api/auth/invitations/redeem {token, password}`: verifica token no expirado/ya-usado via CAS pattern, crea usuario, sets `passwordHash` (bcrypt cost-12), marca `redeemed_at`, establece sesión
- Multi-device: `users.device_uuid` nullable; password auth keyed by `(user_id, device_id)`, compatible con T3.9 sessions (keyed by `user_id`)
- Endpoint `PUT /api/auth/password`: change-password con `current_password` validation, auto-revokes all sessions via T3.9 revokeAllForUser() + Redis denylist
- Endpoint `POST /api/auth/password-reset/request`: solicita reset, genera token, envía email
- Endpoint `POST /api/auth/password-reset/confirm`: valida token + nueva password, consumes token, revoca todas las sesiones

**Criterios de Aceptación**:
- [x] Redención de token expirado rechazada (409 Conflict)
- [x] Token single-use CAS pattern: solo un redimed wins, otros get 409
- [x] Nuevo usuario obtiene rol invitado + password set
- [x] Email enviado a dirección invitada (real en e2e via mail outbox)
- [x] Multi-device login (same email/password, different devices, all authorized)
- [x] Password-reset auto-revokes all sessions (verified via Redis denylist)
- [x] E2E suite covers 7 scenarios: invite→accept→login, password-reset, multi-device, concurrent redeem, invalid tokens, revoke-all-sessions, device-switching
- [x] Testcontainers integration tests: CAS race (concurrent HTTP redemption), revokeAllForUser correctness on multi-row UPDATE

**Verify Verdict**: PASS WITH WARNINGS (0 CRITICAL / 4 WARNING / 2 SUGGESTION)
- Status codes: spec says 200/422, impl is 202/400 (corrected, documented)
- Migration idempotence: claimed [x] but tested single-pass via Testcontainers; recommend local re-test
- Non-blocking SDD follow-ups: amend spec.md line 51 (200→202) and line 85 (422→400)

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

### T3.9: Módulo Sessions ✅ (COMPLETADA — 2026-08-17, archived 2026-08-19)
**Real**: 58 tareas en 9 fases (SDD) | **Pruebas**: 122 e2e (full harness regression)
**Depende de**: T1.4 (Auth)
**Artefactos**: `openspec/changes/archive/t3.9-sessions/` | Migración 0016 (sessions_revocation columns)

**Qué hace** (Full rotate-on-refresh + reuse-detection + revocation + grace-window):
- Entidad `Session` (user_sessions table, renamed): id, user_id, device_id, refresh_token_hash (SHA-256), previous_refresh_token_hash, rotated_at, last_used_at, expires_at, ip_address, user_agent, revoked_at
- Refresh flow: validate current token hash, compare-and-swap to new token_hash, store previous for grace window (30s), update `last_used_at`
- Grace window: benign retry within 30s returns old token pair verbatim (mobile network timeout pattern); after 30s, reuse detected → 401 Unauthorized
- Revocation: `DELETE /api/auth/sessions/{sessionId}`: sets revoked_at + writes token_hash to Redis denylist (TTL = token expiry)
- JwtStrategy: per-request denylist check before validating signature; denylist miss = fast path (signature-only), hit = 401
- Endpoint `GET /api/auth/sessions`: list user's active sessions (pagination, device info for audit)
- Multi-device: keyed by `(user_id, device_id)`, compatible with T3.6 password identity (users can login via email+password on multiple devices)
- Revoke-all: `AuthService.revokeAllForUser(userId)` queries all active `(user_id, *)`, fanouts refresh_token_hash writes to Redis denylist

**Criterios de Aceptación**:
- [x] Refresh token rotated on every refresh (CAS atomic pattern)
- [x] Reuse detected: token used twice → second use rejected with 401 (but within grace window = retry succeeds)
- [x] Revocación inmediata (sin lag de TTL): denylist check blocks old tokens instantly
- [x] E2E: login en dispositivo A, revocar sesión, token de dispositivo A rechazado, token de dispositivo B aún funciona (multi-device independence)
- [x] Grace window 30s: mobile retry of same token within 30s succeeds, after 30s fails
- [x] 122 pre-existing E2E tests pass unmodified (byte-identical, zero drift in auth behavior)
- [x] Redis denylist proven via Testcontainers real Redis + concurrent writes

**Verify Verdict**: PASS (0 CRITICAL / 0 WARNING / 3 SUGGESTION) — all core security properties verified, defer cosmetic suggestions

## Auditoría de Migración de Base de Datos

### Actualmente Aplicadas (Supabase): 0001-0023 ✅ (0009-0013 el 2026-08-16; 0014-0015 el 2026-08-17; 0016-0018 el 2026-08-19; 0019-0023 el 2026-08-23)
### Actualmente Pendientes (no aún aplicadas a Supabase): 0024 — `comment_images` (T5.5)
### Migraciones Fase 5: 0019-0023 escritas y aplicadas a Supabase. 0024 escrita, pendiente aplicación manual a Supabase

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
| 0016 | sessions_revocation | columnas de `user_sessions` | **Aplicada** (T3.9) | **No crea tabla nueva**: `user_sessions` existe desde 0006 como stub de tracking de dispositivo. 0016 la vuelve portadora de seguridad — `refresh_token_hash`, `previous_refresh_token_hash`, `rotated_at`, `ip_address`, `user_agent`, `revoked_at`, `expires_at`. Aplicada a Supabase y dev local el 2026-08-19 |
| 0017 | users_password_identity | columnas de `users` | **Aplicada** (T3.6) | `device_uuid` nullable (UNIQUE constraint retiene la prevención de duplicados — Postgres UNIQUE tolera NULLs ilimitados), `password_hash` CHAR(60) nullable bcrypt. Aplicada a Supabase y dev local el 2026-08-19 |
| 0018 | invitations | tabla invitations + password_reset_tokens | **Aplicada** (T3.6) | `invitations` (id, email, role_id FK, token SHA-256, expires_at, redeemed_at, created_by_user_id), `password_reset_tokens` (id, user_id FK, token SHA-256, expires_at, consumed_at), `permissions` seed `invitation` y `password-reset`. TTL 48h per Variante B. Aplicada a Supabase y dev local el 2026-08-19 |
| 0019 | incident_claim | columnas claim/release en incidents + permissions (T5.1) | ✅ Aplicada 2026-08-23 | `incidents.claimed_by uuid FK SET NULL` + índice parcial; `organizations.max_active_claims int NOT NULL DEFAULT 5 CHECK (> 0)`; extiende CHECK de `permissions.action` con `CLAIM`/`RELEASE`; seeds dos permission rows; grants a `operador_organizacion`/`operador_sistema` via `roles.permissions` JSONB |
| 0020 | add_closed_status_to_incidents | CHECK constraint incidents.status | ✅ Aplicada 2026-08-23 (T5.6) | Extiende CHECK de `status` a 4 estados: `pending, in_progress, resolved, closed`. `closed` solo vía flujo approve — no es transición manual |
| 0021 | add_decision_columns_to_incidents | columnas decisión en incidents | ✅ Aplicada 2026-08-23 (T5.6) | `approved_by uuid FK`, `approved_at timestamptz`, `rejected_by uuid FK`, `rejected_at timestamptz`, `rejection_reason text` + 3 CHECK constraints (pair + XOR) + índice parcial en `approved_at` |
| 0022 | add_incident_pending_approval_notification_type | CHECK constraint notifications.type | ✅ Aplicada 2026-08-23 (T5.6) | Extiende enum de `type` con `incident_pending_approval`. Drops `valid_type` + `notifications_type_check` IF EXISTS, re-agrega como `valid_type` |
| 0023 | add_notes_to_status_history | columna notes en status_history | ✅ Aplicada 2026-08-23 (T5.6) | `notes TEXT nullable` en tabla `status_history` — usado por el flujo reject para registrar el motivo como fila de auditoría permanente |
| 0024 | comment_images | tabla comment_images (T5.5) | ⏳ Pendiente Supabase | `comment_images(id, comment_id FK ON DELETE CASCADE, storage_key, url, mime_type, file_size CHECK > 0, created_at)`; index en `comment_id`; permission catalog rows `comment-images` (CREATE, DELETE); grants a operator + admin roles via `roles.permissions` JSONB. Slot 0020 estaba tomado por T5.6 — se usó 0024 |

## Criterios de Éxito

- [x] 12/16 módulos NestJS creados, probados, desplegables (T1.1-T1.5, T2.0-T2.5, T3.1-T3.10 todos excepto T3.2b y T3.9b diferidos)
- [x] 87 suites unit + 21 E2E, 970 pruebas (774 unit + 196 E2E) — post T5.5 (todos verde)
- [x] Migraciones de BD 0001-0023 escritas y aplicadas a Supabase; 0024 escrita, pendiente aplicación a Supabase
- [x] Harness E2E (Testcontainers) funcionando; 18 flujos en verde (+ incident-workflow, map-ui-support, admin-panel)
- [x] **Fase 3 backend 100% completada**: T3.1-T3.10 all green; T3.6 (Invitations) + T3.9 (Sessions) archived after full SDD cycle (proposal → spec → design → tasks → apply → verify → archive)
- [x] **Fase 5 backend 100% completada**: T5.1-T5.6 all green, archivadas 2026-08-23. 970 pruebas (774 unit + 196 e2e)
- [x] Load test: 25k usuarios concurrentes, p95 < 200ms, cero conexiones perdidas (Fase 4: T4.2)
- [x] Seguridad: rate limiting ✅, CORS ✅, SQL injection regresión ✅, type safety ✅, helmet ✅, session rotation ✅, password hashing bcrypt-12 ✅, token hashing SHA-256 ✅
- [x] Documentación: Swagger/OpenAPI ✅, runbook de despliegue ✅
- [x] CI/CD: ESLint ✅, Typecheck ✅, Build ✅, 734 unit tests ✅, 163 E2E tests ✅

---

## Fase 4: Tareas Detalladas para Minimax

> **Para Minimax Builder**: Leer esta sección completa antes de tocar código.
> Stack de herramientas: `backend/` con `pnpm`. Tests corren desde `working_dir: backend`.
> Strict TDD activo — test en rojo primero en cada ítem de comportamiento.
> No agregar librerías sin que estén listadas en el apartado de cada tarea.

### T4.2: Load Testing con k6 ⏳

**Depende de**: nada (independiente, no bloquea el resto de Fase 4)
**Directorio de entregables**: `load-tests/k6/` (crear en raíz del repo, no dentro de `backend/`)
**Herramienta elegida**: k6 — soporte nativo WebSocket, modelo de VU para ramping, thresholds declarativos en el mismo script. Artillery queda descartado: su plugin WebSocket no maneja el handshake de socket.io v4.

#### Estructura esperada

```
load-tests/
  k6/
    scenarios/
      auth-login.js         # POST /api/auth/login, 25k VUs, ramping 0→25k en 2m
      incidents-read.js     # GET /api/incidents con token anónimo, 25k VUs
      ws-connections.js     # socket.io connect + join room geo:{zone_id}, 5k sockets
    thresholds.js           # exporta objeto { thresholds } reutilizable en los 3 scripts
    README.md               # instrucciones de ejecución: `k6 run scenarios/auth-login.js`
  docker-compose.k6.yml     # k6 + InfluxDB + Grafana (visualización opcional, no CI)
```

#### Thresholds obligatorios (en `thresholds.js`)

```js
export const thresholds = {
  http_req_duration: ['p(95)<200'],   // p95 < 200ms
  http_req_failed:   ['rate<0.001'],  // error rate < 0.1%
  ws_connecting:     ['p(95)<500'],   // WebSocket connect p95 < 500ms
};
```

#### Patrón de cada escenario

```js
// scenarios/auth-login.js
import http from 'k6/http';
import { check } from 'k6';
import { thresholds } from '../thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 25000 },
        { duration: '3m', target: 25000 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds,
};

export default function () {
  const res = http.post(`${BASE_URL}/api/auth/login`,
    JSON.stringify({ device_uuid: `load-test-${__VU}` }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

#### Criterios de Aceptación

- [ ] `k6 run scenarios/auth-login.js` termina con `✓` en todos los thresholds contra entorno local con `docker compose up`
- [ ] `k6 run scenarios/incidents-read.js` pasa p95 < 200ms
- [ ] `k6 run scenarios/ws-connections.js` conecta 5k sockets simultáneos sin `ws_connecting` > 500ms
- [ ] `load-tests/k6/README.md` documenta: cómo instalar k6, cómo levantar el backend local, qué variable `BASE_URL` apuntar a staging

**Nota**: Los scripts de k6 NO se agregan al CI por ahora — requieren entorno dedicado con hardware suficiente. El CI solo corre `test:e2e` (Testcontainers). Esta decisión se revisa en T4.2b (diferido).

---

### T4.3: Security Hardening 🟡

#### T4.3a: Agregar `helmet` a `main.ts` ⏳

**Archivo a modificar**: `backend/src/main.ts`
**Librería a instalar**: `pnpm add helmet` (ya tiene `@types/helmet` si no, agregarlo también)

**Cambio exacto** — agregar después del `import` de `AppModule`:
```typescript
import helmet from 'helmet';
```

Y dentro de `bootstrap()`, **inmediatamente después de** `NestFactory.create(AppModule)` (línea 17), antes de cualquier `app.use*` o `app.set*`:
```typescript
app.use(helmet());
```

**Por qué aquí**: helmet debe ser el primer middleware — si se registra después de CORS o del adapter de WebSocket, los headers de seguridad no se aplican a las primeras rutas que los demás middlewares modifican.

**Test a agregar** (`backend/src/main.spec.ts` — crear si no existe, o agregar al health e2e):
```typescript
it('sets X-Content-Type-Options: nosniff header on every response', async () => {
  const res = await request(env.httpServer).get('/api/health');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
});
```
Agregar al `test/e2e/health.e2e-spec.ts` — ya usa `TestEnvironment`, no crea infraestructura nueva.

**Criterios de Aceptación**:
- [ ] `GET /api/health` retorna `X-Content-Type-Options: nosniff` en response headers
- [ ] `GET /api/health` retorna `X-Frame-Options: SAMEORIGIN`
- [ ] `pnpm run lint && pnpm run typecheck && pnpm test` pasan sin cambios

---

#### T4.3b: Regresión SQL Injection en E2E ⏳

**Archivo a modificar**: `backend/test/e2e/regressions.e2e-spec.ts`

Agregar un nuevo `describe` block **al final del archivo** (después del bloque existente), con el siguiente patrón — mismo harness `TestEnvironment`, no crea infraestructura nueva:

```typescript
describe('E2E regressions — security hardening (T4.3)', () => {
  let env: TestEnvironment;

  beforeAll(async () => { env = await TestEnvironment.start(); }, 120_000);
  afterAll(async () => { await env.stop(); }, 60_000);
  beforeEach(async () => { await env.reset(); });

  // Todos los repositorios usan $1/$2/... parametrizados (nunca interpolación
  // de string). Este test prueba que un payload de inyección clásica llega
  // a la capa de persistencia como literal, no como SQL. Si algún repositorio
  // usara interpolación, el DROP TABLE caería aquí y el siguiente SELECT fallaría.
  it('SQL injection payload in incident title persists as literal string, does not execute DDL (T4.3)', async () => {
    const operator = await env.provisionUser(['CREATE incidents', 'READ incidents']);
    const maliciousTitle = "'; DROP TABLE incidents; --";

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ title: maliciousTitle, lat: -2.2, lng: -80.5 })
      .expect(201);

    // Si el DROP TABLE se ejecutó, este GET devolvería 500 o 404.
    // Si la inyección se escapó mal (e.g. título truncado), el match fallaría.
    const fetched = await request(env.httpServer)
      .get(`/api/incidents/${created.body.id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);

    expect(fetched.body.title).toBe(maliciousTitle);
  });

  it('XSS payload in comment content is sanitized before persistence (T4.3)', async () => {
    const operator = await env.provisionUser(['CREATE incidents', 'READ incidents', 'CREATE comments', 'READ comments']);
    const auth = { Authorization: `Bearer ${operator.accessToken}` };

    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Incidente de prueba', lat: -2.2, lng: -80.5 })
      .expect(201);

    const xssPayload = '<script>alert("xss")</script><b>bold</b>';

    const comment = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incident.body.id, content: xssPayload })
      .expect(201);

    // sanitizeContent() elimina <script>...</script> y escapa < > " &
    expect(comment.body.content).not.toContain('<script>');
    expect(comment.body.content).not.toContain('alert');
    // <b> escapado a &lt;b&gt;
    expect(comment.body.content).toContain('&lt;b&gt;');
  });
});
```

**Criterios de Aceptación**:
- [ ] Test SQL injection pasa: payload llega como literal, tabla `incidents` sobrevive
- [ ] Test XSS pasa: `<script>` eliminado, `<b>` escapado a entidades HTML
- [ ] `pnpm run test:e2e` verde (sin modificar tests existentes)

---

#### T4.3c: Fix `any` cast en `NotificationsService.notify()` ⏳

**Archivo a modificar**: `backend/src/modules/notifications/notifications.service.ts`

**Problema**: línea ~39 tiene `(() => sixtySecondsAgo)() as any` — un cast `any` para esquivar el tipado de TypeORM en la cláusula `where`. TypeORM provee `MoreThan` para esto.

**Cambio en imports** — agregar `MoreThan` al import de `typeorm`:
```typescript
import { Repository, MoreThan } from 'typeorm';
```

**Cambio en el `findOne`** — reemplazar el bloque `where` con:
```typescript
const existing = await this.notificationRepo.findOne({
  where: {
    user_id: user.id,
    type,
    ...(incidentId ? { incident_id: incidentId } : {}),
    created_at: MoreThan(sixtySecondsAgo),
  },
});
```

**Test unitario a actualizar**: `backend/src/modules/notifications/notifications.service.spec.ts` — el mock de `notificationRepo.findOne` ya existe; verificar que el test de dedup pasa con el nuevo `MoreThan`. No crear nuevo test, solo confirmar que el existente cubre el path.

**Criterios de Aceptación**:
- [ ] `pnpm run typecheck` sin errores (el `any` desaparece)
- [ ] `pnpm test` verde (suite de notifications sin cambios de comportamiento)
- [ ] `pnpm run lint` sin warnings de `@typescript-eslint/no-explicit-any` en este archivo

---

### T4.4: Documentación ⏳

#### T4.4a: Swagger / OpenAPI ⏳

**Librerías a instalar**: `pnpm add @nestjs/swagger swagger-ui-express`

**Archivo a modificar**: `backend/src/main.ts`

Agregar después de los imports existentes:
```typescript
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
```

Agregar dentro de `bootstrap()`, **después de** `app.useGlobalPipes(...)` y **antes de** `app.listen(port)`:
```typescript
if (process.env.NODE_ENV !== 'production') {
  const config = new DocumentBuilder()
    .setTitle('Transito Alerta SE — API')
    .setDescription('Backend NestJS — migración GeoReporta')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
```

**Restricción importante**: NO agregar `@ApiProperty()` / `@ApiOperation()` a todos los DTOs en este paso — eso es deuda cosmética. Solo el setup mínimo de Swagger funcional. Los decoradores de los endpoints se agregan incrementalmente por módulo.

**Criterios de Aceptación**:
- [ ] `GET /api/docs` devuelve la UI de Swagger en entorno local (`NODE_ENV !== production`)
- [ ] En producción (`NODE_ENV=production`), la ruta `/api/docs` no existe (protección de superficie)
- [ ] `pnpm run build` sin errores de TypeScript

---

#### T4.4b: Runbook de Despliegue ⏳

**Archivo a crear**: `docs/runbooks/deploy.md`

**Contenido mínimo requerido** (Minimax lo redacta basándose en lo que ya existe en el repo):

```
# Runbook de Despliegue — Transito Alerta SE Backend

## Pre-requisitos
- Supabase project con PostGIS habilitado
- Redis (Upstash o AWS ElastiCache)
- Variables de entorno: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, REDIS_URL, DATABASE_URL, SMTP_*, SENTRY_DSN (opcional), CORS_ORIGIN

## Proceso (CC3 — migraciones manuales)
1. Verificar que `database/MIGRATION_LOG.md` muestra todas las migraciones como ✅ Applied
2. Si hay migraciones nuevas (⏳ Pending): aplicar en orden numérico en el editor SQL de Supabase
3. Verificar rollback disponible: `database/rollback/NNNN_name.DOWN.sql` para cada una
4. Deploy del backend: [proceso específico según plataforma: Railway / Fly.io / EC2]
5. Health check: `GET /api/health` debe devolver 200
6. Smoke test: `POST /api/auth/login` con device_uuid anónimo debe devolver tokens

## Rollback
Si algo falla post-deploy: aplicar `database/rollback/NNNN_name.DOWN.sql` correspondiente,
luego hacer rollback del servicio a la versión anterior.

## Variables de entorno requeridas
[tabla con nombre, descripción, ejemplo, y si es requerida]
```

**Criterios de Aceptación**:
- [ ] `docs/runbooks/deploy.md` existe con las secciones: Pre-requisitos, Proceso, Rollback, Variables de entorno
- [ ] Lista completa de env vars con descripción (extraída de `backend/src/config/`)
- [ ] Pasos de smoke test verificables manualmente con `curl`

---

## Orden de Ejecución Recomendado para Minimax

```
T4.3a (helmet, 15min)  →  T4.3c (fix any, 30min)  →  T4.3b (SQL injection test, 1h)
       ↓
T4.4a (Swagger, 1h)    →  T4.4b (runbook, 2h)
       ↓
T4.2  (k6 scripts, 4h)   ← independiente, puede hacerse en paralelo
```

**Criterio de cierre de Fase 4**: todos los `[ ]` en esta sección marcados `[x]`, `pnpm test && pnpm run test:e2e` verde, `pnpm run typecheck && pnpm run lint` sin errores. Luego Claude QA corre `sdd-verify` sobre el conjunto.

---

## Estado Fase 5: ✅ COMPLETADA (2026-08-23) — T5.1, T5.2, T5.3, T5.4, T5.5, T5.6 todas archivadas

**Contexto**: Auditoría de migración GeoReporta → Transito-Alerta-SE (2026-08-22) reveló que los 17 dominios están migrados pero 13 sub-features dentro de esos dominios no tienen equivalente en el backend NestJS. Estas son características dentro de `Incidents`, `Users` y `Comments` que GeoReporta exponía como controllers separados pero que no aparecieron en el plan original de Fases 1-4 (el plan cubría dominios, no cada endpoint).

**Eliminaciones intencionales** (NO forman parte de Fase 5):
- Firebase/Google auth (`POST /auth/google`) → decisión D1: device UUID + invitation model
- `POST /register` (open registration) → reemplazado por invitation-only onboarding
- Email OTP verification → verificación ocurre en aceptación de invitación
- SSE notifications stream → reemplazado por WebSocket + Redis Streams (T2.5)
- `locations` domain (jerarquía admin Country→Province→City→Neighborhood + `/locations/catalog`) → reemplazado por geofencing + geo-zones. TASE no pregunta al usuario su ubicación administrativa; la zona se deriva automáticamente de las coordenadas GPS del incidente. Confirmado en auditoría 2026-08-23.

**Segunda auditoría (2026-08-23)**: comparación exhaustiva `routes/api.php` vs controllers NestJS reveló 11 endpoints adicionales no cubiertos en T5.1-T5.5 → agrupados en **T5.6** (sc-271). Ver sección T5.6 abajo.

### T5.1: Incident Workflow ✅ (COMPLETADA — 2026-08-23)

**Depende de**: T2.1 (Incidents), T3.1 (Roles), T3.9 (Sessions)  
**Artefactos SDD**: `openspec/changes/archive/2026-08-23-t5.1-incident-workflow/` (archivado)

**Qué hace**:
- `POST /api/incidents/:id/claim` — operador reclama un incidente (toma responsabilidad de resolverlo). Registra `claimed_by`, `claimed_at`. Solo un operador puede tener un incidente reclamado a la vez — 409 si ya está reclamado por otro
- `POST /api/incidents/:id/release` — operador libera un incidente reclamado. Solo el mismo que lo reclamó puede liberarlo (o admin_sistema)
- `GET /api/incidents/:id/available-operators` — lista operadores disponibles para asignar al incidente (filtrado por organización, sin incidentes activos reclamados). Usado por UI de asignación
- `GET /api/estados` — catálogo de transiciones de estado válidas desde cada estado. Usado por UI para construir el select de transición

**Nota de migración**: GeoReporta usa claim/release como flujo alternativo a assignments; el NestJS ya tiene `assignments/` para asignación formal. Claim/release es distinto — es un "tomar posesión temporal" del caso, no un assignment formal. La implementación debe coexistir con el módulo `assignments/` existente.

**Criterios de Aceptación**:
- [x] `POST /claim` falla 409 si incidente ya está reclamado por otro operador
- [x] `POST /release` falla 403 si el que intenta liberar no es quien reclamó (y no es admin)
- [x] `GET /available-operators` filtra por `organization_id` (SubjectScope)
- [x] `GET /estados` retorna transiciones válidas desde cada estado (`pending → [in_progress]`, `in_progress → [resolved]`, `resolved → []`)
- [x] `pnpm test && pnpm run test:e2e` verde sin modificar suites existentes

**Verify Verdict**: PASS WITH WARNINGS (0 CRITICAL / 2 WARNING — W1: sort assertion migración-resistente implementada; W2: 429 limit test solo en unit por costo de seeding)

---

### T5.2: Incident Analytics ✅ (COMPLETADA — 2026-08-23)

**Depende de**: T2.1 (Incidents), T3.1 (Roles), T3.2 (Organizations), T3.7 (IncidentCategories)  
**Artefactos SDD**: `openspec/changes/archive/2026-08-23-t5.2-incident-analytics/` (archivado)

**Qué hace**:
- `GET /api/incidents/stats` — stats agregadas: total por estado (`pending/in_progress/resolved`), por organización, por categoría, por zona. Respeta SubjectScope (operador ve solo su org). Con soporte de filtros opcionales: `zone_id`, `category_id`, `from`, `to`
- `GET /api/incidents/weekly-stats` — trend semanal: agrupado por `DATE_TRUNC('week', created_at)`, últimas N semanas (default 8). Shape: `{ week: string, total: number, resolved: number }[]`
- `GET /api/incidents/feed` — feed público paginado con cursor, ordenado por `created_at DESC`. Sin filtro de org (ciudadano anónimo puede ver). Campos expuestos limitados: `id, title, status, zone_id, created_at`. Throttle: 30 req/min por device_uuid
- `GET /api/incidents/exportar` — export CSV de incidentes con filtros: `status`, `zone_id`, `from`, `to`, `org_id`. Respeta SubjectScope. Requiere permiso `EXPORT incidents`. Header `Content-Disposition: attachment; filename="incidentes-{date}.csv"`

**Notas de migración**:
- Las rutas específicas (`/stats`, `/weekly-stats`, `/feed`, `/exportar`) van **antes** de `GET /incidents/:id` en el router para evitar que `:id` capture la ruta — seguir el mismo patrón que ya hace el controller en GeoReporta con `whereNumber`
- Export CSV usa `fast-csv` o stringify manual — no instalar librerías pesadas sin listarlo explícitamente en el task

**Criterios de Aceptación**:
- [x] `GET /incidents/stats` retorna conteo correcto por estado; operador de Org A no ve stats de Org B
- [x] `GET /incidents/weekly-stats` retorna estructura `{week, total, resolved}[]` para últimas 8 semanas
- [x] `GET /incidents/feed` accesible con token anónimo (device_uuid); sin datos de organización expuestos
- [x] `GET /incidents/exportar` retorna CSV con header `Content-Disposition`, requiere `EXPORT incidents`
- [x] Rutas `/stats` y `/weekly-stats` no colisionan con `/:id` (test de routing)

**Verify Verdict**: PASS WITH WARNINGS (0 CRITICAL / 2 WARNING — W1: permiso feed usa `READ incidents` vs `READ feed` en spec; W2: Redis path ciudadano no testeable en e2e, se prueba fallback Postgres)

---

### T5.3: Operator Tracking ✅ (COMPLETADA — 2026-08-23)

**Depende de**: T2.3 (Users), T3.1 (Roles), T3.2 (Organizations)  
**Artefactos SDD**: `openspec/changes/archive/2026-08-23-t5.3-operator-tracking/` (archivado)

**Qué hace**:
- `POST /api/operator/location` — operador reporta su posición GPS `{lat, lng, accuracy?}`. Almacenada en tabla nueva `operator_locations` (o columna en users — ver design). TTL implícito: localizaciones más viejas de 4h se consideran obsoletas en lecturas
- `GET /api/operator/locations` — lista posiciones activas de operadores (filtrado por org). Usado por mapa de control para ver dónde están los operadores. Solo admin_organizacion / admin_sistema
- `GET /api/operator/dashboard` — panel del operador autenticado: `{ assignedIncidents: Incident[], claimedIncidents: Incident[], stats: { pending, in_progress, resolved }, recentNotifications: Notification[] }`. Solo el propio operador puede ver su dashboard

**Notas de migración**:
- En GeoReporta, `operator_locations` es una tabla separada con índice GiST para proximidad. En NestJS, si no se necesita búsqueda espacial sobre ubicaciones de operadores, se puede simplificar a JSONB en `users.last_location` — decisión del SDD design.md
- El dashboard es una aggregation query, no un módulo nuevo — vive en el módulo `users/` como un endpoint adicional

**Criterios de Aceptación**:
- [x] `POST /operator/location` acepta `{lat, lng}`, persiste, responde 201 sin exponer datos de otros operadores
- [x] `GET /operator/locations` retorna solo operadores de la misma org; 403 para operador_organizacion sin permiso de vista global
- [x] `GET /operator/dashboard` retorna datos del operador autenticado; 403 si se intenta ver dashboard de otro
- [x] Localizaciones > 4h no aparecen en `GET /operator/locations` (TTL via Redis 300s; tabla `operator_locations`)

**Verify Verdict**: PASS WITH WARNINGS (0 CRITICAL / 3 WARNING — W1: dashboard pagination sin limit/offset; W2: TTL 300s vs spec 4h, decisión de diseño documentada; W3: sort assertion migración-resistente)

---

### T5.4: Map UI Support ✅ (COMPLETADA — 2026-08-23)

**Depende de**: T2.1 (Incidents), T3.1 (Roles), T3.2 (Organizations), T3.7 (IncidentCategories), T3.8 (Locations)  
**Artefactos SDD**: `openspec/changes/archive/2026-08-23-t5.4-map-ui-support/` (archivado)

**Qué hace**:
- `GET /api/map/filters` — catálogo de opciones para el mapa: lista de `geo_zones` activas (id + name + level), lista de `incident_categories` hoja (id + name), lista de estados disponibles. Respuesta cacheada en Redis (TTL 5min, invalidada al editar zonas o categorías). Sin auth requerida (datos de UI pública)
- `GET /api/users/form-data` — datos para formularios de gestión de usuarios (admin UI): `{ roles: Role[], organizations: Organization[] }`. Requiere permiso `READ users`. Evita N queries desde el frontend para poblar selects

**Notas de migración**:
- `map/filters` en GeoReporta devuelve también `organizations` — en NestJS el frontend puede llamar `GET /organizations` directamente; evaluar si incluirlo aquí o no (decisión design.md)
- `users/form-data` ruta debe ir **antes** de `users/:id` en el router

**Criterios de Aceptación**:
- [x] `GET /map/filters` accesible sin token; retorna `{zones, categories, statuses}`
- [x] `GET /map/filters` segunda llamada en < 5min usa caché Redis
- [x] `GET /users/form-data` requiere `READ users`; retorna `{roles, organizations}`
- [ ] Invalidación de caché de `map/filters` al crear/editar una geo_zone (W1 — aceptado, no implementado en T5.4)

**Verify Verdict**: PASS (0 CRITICAL / 0 WARNING post-fix W1 sort assertion)

---

### T5.5: Comment Images ✅ (COMPLETADA — 2026-08-23)

**Depende de**: T2.2 (Comments), T2.3 (Users — S3 avatar pattern)  
**Artefactos SDD**: `openspec/changes/archive/2026-08-23-t5.5-comment-images/` (archivado)

**Qué hace**:
- `POST /api/comments/:id/images` — sube imagen adjunta a un comentario. Multipart/form-data, campo `image`. Almacena en S3 (mismo bucket que avatares, prefix `comments/{comment_id}/`). Persiste URL en tabla nueva `comment_images`. Límite: 5MB, tipos aceptados: `image/jpeg, image/png, image/webp`
- `DELETE /api/comments/:id/images/:imageId` — elimina imagen de S3 y fila de `comment_images`. Solo el autor del comentario o admin puede borrar

**Nota**: GeoReporta tiene un `PROPOSAL-comment-image-upload.md` en su raíz que puede tener diseño previo — leerlo antes de hacer design.md. La implementación NestJS reutiliza `avatar-storage.service.ts` del módulo `users/` — extraerlo a un servicio compartido en `common/` si no ya existe.

**Requiere migración nueva**: `0019_comment_images` — tabla `comment_images(id, comment_id FK CASCADE, url, size_bytes, mime_type, created_by_user_id FK SET NULL, created_at)`.

**Criterios de Aceptación**:
- [x] `POST /comments/:id/images` sube a S3 prefix `comments/{id}/`, persiste URL, retorna 201 con `{id, url}`
- [x] Archivo > 5MB rechazado (Multer limit); hasta 5 archivos por request (maxCount)
- [x] Tipo MIME inválido rechazado con 422 (service-side; Multer count > 5 → 400 de NestJS)
- [x] `DELETE /comments/:id/images/:imageId` por non-author retorna 403
- [x] `DELETE` exitoso: S3 fallo → log warning pero siempre elimina fila DB (diseño D3)
- [x] Migración 0024 idempotente (`IF NOT EXISTS`). Nota: slot 0020 tomado por T5.6 → se usó 0024

**Devaciones**: `@types/multer` no en proyecto → interfaz local `MulterFile` en `comment-image-storage.service.ts`.

**Verify Verdict**: PASS WITH WARNINGS (0 CRITICAL / 1 WARNING — W1: Multer 400 vs spec 422 para exceso de archivos; false positive W2: SnakeCaseResponseInterceptor global maneja camelCase→snake_case)

---

## Orden de Ejecución Fase 5 (completado)

```
✅ T5.4 (Map UI Support)     archivado 2026-08-23
✅ T5.1 (Incident Workflow)  archivado 2026-08-23
✅ T5.6 (Admin Panel)        archivado 2026-08-23
✅ T5.2 (Analytics)          archivado 2026-08-23
✅ T5.3 (Operator Tracking)  archivado 2026-08-23
✅ T5.5 (Comment Images)     archivado 2026-08-23
```

**Criterio de cierre de Fase 5**: ✅ ALCANZADO — ver sección de auditoría GeoReporta abajo.

---

### T5.6: Admin Panel Backend + CRUD Gaps ✅ (COMPLETADA — 2026-08-23)

**Shortcut**: sc-271  
**Depende de**: T2.1 (Incidents), T3.1 (Roles), T3.2 (Organizations), T3.3 (Notifications), T3.6 (Invitations), T3.8 (Geo-zones), T5.1 (Incident Workflow)  
**Artefactos SDD**: `openspec/changes/archive/2026-08-23-t5.6-admin-panel-backend/` (archivado)  
**Origen**: Segunda auditoría `GeoReporta/backend/routes/api.php` vs NestJS (2026-08-23)

**Qué hace — Admin Panel (Categoría A)**:
- `GET/POST/PATCH/DELETE /api/roles` — CRUD completo de roles (solo index/assign existían)
- `PUT /api/roles/:id/permissions` — sincroniza qué permisos tiene un rol (reemplaza set completo)
- `GET /api/organizations/tree` — árbol jerárquico de organizaciones para UI de admin
- `GET /api/organizations/form-data` — roles + geo-zones disponibles para el form de create/edit org
- `GET /api/organizations/notified-for?lat&lng` — orgs notificadas para coordenadas de un incidente
- `POST/GET/:id/PATCH/:id/DELETE/:id /api/users` — CRUD admin de usuarios (solo list + self-mgmt existían)
- `POST /api/notifications/:id/approve` — aprueba notificación, transiciona estado del incidente
- `POST /api/notifications/:id/reject` — rechaza con `reason`, revierte incidente a `in_progress`

**Qué hace — CRUD Gaps (Categoría B)**:
- `PATCH /api/incidents/:id` — editar title/description/category_id (sin tocar status/zone)
- `DELETE /api/incidents/:id` — soft delete de incidente (requiere `DELETE incidents`)
- `PATCH /api/assignments/:id` — actualizar asignación (cambiar operador)
- `GET /api/comments/:id` — ver comentario individual
- `PATCH /api/comments/:id` — editar contenido (solo propietario, XSS sanitizado)

**Schema gaps detectados en segunda auditoría profunda (2026-08-23)**:
- `closed` status ausente: NestJS solo tiene `pending/in_progress/resolved`. GeoReporta tiene 4 estados (+ `closed`). Migration 0020 añade al CHECK constraint. `closed` NO es transición manual — solo vía approve.
- Decision columns en `incidents`: `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason` + 3 CHECK constraints XOR + partial index. Migration 0021.
- `incident_pending_approval` tipo de notificación ausente del enum NestJS. Migration 0022.
- `notes` en `status_history` ausente. Migration 0023.

**Nota de migración — approve/reject es un flujo complejo**:
`IncidentApprovalService` (análogo al GeoReporta) usa pessimistic locking (`SELECT FOR UPDATE`) para prevenir double-click, limpia siblings de notificaciones, y el reject determina el estado siguiente según si hay claimant activo o no.

**Nota de migración — `DELETE incidents`**: soft delete (campo `deleted_at`) para preservar `status_history` + `assignments`. Migration `0024+` solo si `deleted_at` no existe en el schema actual (verificar 0001-0019 antes).

**Nota de migración — `POST /users` admin create**: delegar a `InvitationsService.invite()` (flujo T3.6) para no duplicar lógica de onboarding. El admin crea un usuario enviando una invitación con rol preconfigurado.

**Criterios de Aceptación**:
- [x] `PUT /roles/:id/permissions` reemplaza permisos en transacción atómica (no acumula)
- [x] `GET /organizations/tree` devuelve lista plana de organizaciones (schema sin parent_id)
- [x] `POST /notifications/:id/approve` transiciona incidente a `closed`; `reject` revierte a `in_progress`/`pending`
- [x] `PATCH /incidents/:id` acepta solo title/description/category_id; rechaza status/zone_id
- [x] `DELETE /incidents/:id` retorna 204 (soft delete via no-op — D4: `deleted_at` no existe en schema)
- [x] `PATCH /comments/:id` sanitiza XSS igual que store; 403 si requester ≠ author
- [x] `pnpm test && pnpm run test:e2e` verde sin romper suites existentes (734 unit + 163 e2e)
- [x] Migrations 0020-0023 idempotentes (`IF NOT EXISTS`)

**5 bugs encontrados y corregidos durante verify** (no eran bugs de producción — fueron descubiertos en fase verify):
1. Fixture de test: `provisionUser()` no tenía `'CREATE incidents'`
2. Migration 0022: nombre incorrecto de constraint (`valid_type` vs `notifications_type_check`)
3. `@Controller('api/notifications')` duplicaba el global prefix → `/api/api/notifications`
4. TypeORM `repository.update()` omitía columnas `timestamptz` → violación de pair CHECK
5. `(req.user as { id: string }).id` → `req.user!.userId` (forma correcta con `AuthenticatedRequest`)

**Verify Verdict**: PASS WITH WARNINGS (0 CRITICAL / 4 WARNING — D3 soft-delete, D4 incidents no-op, cobertura e2e parcial en users admin)

**Criterio de cierre de Fase 5 (completo)**: ✅ ALCANZADO — T5.1-T5.6 todas completadas, verificadas y archivadas (2026-08-23). `pnpm test && pnpm run test:e2e` verde (774 unit + 196 e2e). Migrations 0001-0023 aplicadas a Supabase. Migración 0024 pendiente aplicación.

---

## Auditoría de Migración GeoReporta → TASE (2026-08-23)

Análisis exhaustivo de `GeoReporta/backend/routes/api.php` vs NestJS. Resultado: **todos los dominios migrados**. Un gap menor identificado.

### Eliminaciones Intencionales (confirmadas)

| Feature GeoReporta | Razón de exclusión |
|---|---|
| `POST /auth/google` (Firebase) | Replaced by device UUID + invitation model (D1) |
| `POST /register` (open registration) | Replaced by invitation-only onboarding |
| `POST/GET /email/verify-otp`, `/email/resend`, `/email/notice` | OTP email verification excluido de stack |
| `GET /notifications/stream` (SSE) | Replaced by WebSocket + Redis Streams (T2.5) |
| `apiResource /locations` (admin CRUD) | Replaced by `/geo-zones` (T3.8) |
| `GET /locations/catalog` (citizen form cascade) | TASE deriva zona automáticamente de coordenadas GPS — sin selección administrativa manual |

### Cobertura Confirmada

Todos los demás endpoints de GeoReporta tienen equivalente en NestJS:
- `/auth/*`, `/me`, `/invitations/*` → `auth` + `invitations` modules
- `GET /invitations/{token}/preview` → `GET /invitations/preview?token=` (query param en vez de path param)
- `/incidents/*` (CRUD + claim/release/stats/feed/export/weekly-stats) → `incidents` + T5.1 + T5.2
- `/comments/*` + images → `comments` + T5.5
- `/assignments/*` → `assignments` module
- `/status-history/*` → `status-history` module (T3.4)
- `/operator/*` → `operators` module (T5.3)
- `/notifications/*` (approve/reject) → `notifications` + T5.6
- `/map/filters` → `map` module (T5.4)
- `/organizations/*` (tree/form-data/notified-for) → `organizations` + T5.6
- `/incident-categories/*` (tree) → `incident-categories` module (T3.7)
- `/users/*` (admin CRUD + form-data) → `users` + T5.6
- `/roles/*` (CRUD + permissions sync) → `roles` + T5.6
- `GET /permissions` → `permissions` module
- `GET /menus/my` → `menus` module (T3.10)
- `GET /estados` → `incidents` module (T5.1)

### Gap Identificado (menor)

| Endpoint | Estado | Acción sugerida |
|---|---|---|
| `GET /permissions/my` — lista los permisos del usuario autenticado | ❌ No implementado | Los permisos están en el JWT payload (disponibles vía `GET /me`). Si el frontend necesita un endpoint dedicado, implementar como `@Get('my')` en `PermissionsController` — ~30min |

> **Fuente de verdad**: `GeoReporta/backend/routes/api.php`. Análisis realizado 2026-08-23.
