# Tasks: T6 — GeoReporta Parity Gaps

**Change**: t6-georepota-parity  
**Date**: 2026-08-23  
**Mode**: Strict TDD (`npm test && npm run test:e2e` desde `backend/`)  

> Orden de ejecución: T6.1 → T6.2 → T6.3 → T6.4 → T6.5 → T6.6 → T6.7 → T6.8  
> Cada grupo puede iniciarse solo si el anterior pasa el suite completo.

---

## T6.1 — Fix críticos de API (P1, sin migraciones)

### Fase A — Notifications unread-count

- [x] **T6.1.A1** — En `notifications/notifications.controller.ts`: añadir `@Get('unread-count')` al método `countUnread` (doble decorador junto a `@Get('unread')`) y cambiar el return a `{ unread_count: count }`. **(1h)**
- [x] **T6.1.A2** — Unit test en `notifications.controller.spec.ts` (o crear si no existe): `GET /notifications/unread-count` llama a `countUnread` y retorna `{ unread_count: N }`. **(30min)**
- [x] **T6.1.A3** — E2E test en `test/e2e/t6-notifications.e2e-spec.ts`: usuario con 2 notificaciones no leídas → `GET /notifications/unread-count` → 200 `{unread_count: 2}`. **(1h)**

### Fase B — Organizations notified-for dual input + is_claimable

- [x] **T6.1.B1** — Crear `dto/notified-for-query.dto.ts` en `organizations/`: campos opcionales `lat?: number`, `lng?: number`, `location_id?: string`, `category_id?: string`. Validadores `@IsOptional @IsNumber @Type(() => Number)` / `@IsOptional @IsUUID`. **(30min)**
- [x] **T6.1.B2** — Crear interfaz `OrganizationWithClaimable` que extiende `OrganizationRow` con `is_claimable: boolean`. Exportar desde `organizations.service.ts`. **(15min)**
- [x] **T6.1.B3** — Modificar `organizations.service.ts` → método `notifiedFor`: aceptar `query: NotifiedForQueryDto`. Si `query.location_id` → buscar zona por ID directamente. Si `query.lat + query.lng` → flujo geofencing existente. Sin ninguno → `BadRequestException`. Añadir `is_claimable: org.max_active_claims > 0` a la respuesta. **(1.5h)**
- [x] **T6.1.B4** — Modificar `OrganizationsController.getNotifiedFor`: aceptar `@Query() dto: NotifiedForQueryDto` (en vez de `@Query('lat') lat` y `@Query('lng') lng` separados). **(30min)**
- [x] **T6.1.B5** — Unit tests en `organizations.service.spec.ts`: (a) location_id → resuelve zona por ID y retorna org con is_claimable; (b) lat+lng → flujo geofencing existente; (c) sin parámetros → BadRequestException; (d) location_id no encontrado → array vacío. **(1.5h)**
- [x] **T6.1.B6** — E2E test en `test/e2e/t6-organizations-notified.e2e-spec.ts`: (a) `?location_id={zone_uuid}` retorna orgs; (b) `?lat=-2.2&lng=-80.5` sigue funcionando; (c) sin params → 400. **(1.5h)**
- [x] **T6.1.B7** — `npm test && npm run test:e2e` verde. **(15min)**

---

## T6.2 — Soft Deletes (P1, migraciones 0025-0026)

### Fase A — Migraciones y entidades

- [x] **T6.2.A1** — Crear `database/migrations/0025_incidents_soft_delete.sql`: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL` + índice parcial `WHERE deleted_at IS NULL`. Crear rollback `database/rollback/0025_incidents_soft_delete.DOWN.sql`. **(30min)**
- [x] **T6.2.A2** — Crear `database/migrations/0026_assignments_soft_delete.sql`: `ALTER TABLE assignments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL` + DROP CONSTRAINT IF EXISTS `assignments_incident_id_operator_id_key` + `CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_active ... WHERE deleted_at IS NULL`. Crear rollback. **(45min)**
- [x] **T6.2.A3** — Actualizar `database/MIGRATION_LOG.md`: añadir filas 0025 y 0026 como `⏳ Pending`. **(10min)**
- [x] **T6.2.A4** — En `entities/incident.entity.ts`: añadir `@Column({ type: 'timestamptz', nullable: true, default: null }) deletedAt: Date | null`. **(15min)**
- [x] **T6.2.A5** — En `entities/assignment.entity.ts`: añadir `@Column({ type: 'timestamptz', nullable: true, default: null }) deletedAt: Date | null`. **(15min)**

### Fase B — Repository + Service incidents

- [x] **T6.2.B1** — En `incidents/incidents.repository.ts`: añadir `AND deleted_at IS NULL` (o `deletedAt: IsNull()`) a TODOS los métodos de búsqueda/listado (`findOne`, `findAll`, `count`, queries paginadas, feeds, stats). Verificar método por método con codegraph. **(2h)**
- [x] **T6.2.B2** — En `incidents/incidents.service.ts`: reemplazar el stub `softDelete()` con implementación real: `UPDATE incidents SET deleted_at = NOW() WHERE id = $1`. **(30min)**
- [x] **T6.2.B3** — Unit tests `incidents.service.spec.ts`: `softDelete()` llama a `UPDATE … deleted_at = NOW()`; incidente ya eliminado (findOne retorna null) → NotFoundException. **(1h)**

### Fase C — Service assignments

- [x] **T6.2.C1** — En `assignments/assignments.service.ts`: reemplazar `release()` hard-delete por soft-delete: `findOne` → `NotFoundException` si no existe → `update({ deletedAt: new Date() })`. **(30min)**
- [x] **T6.2.C2** — Unit tests `assignments.service.spec.ts`: `release()` llama update con deletedAt; assignment no existe → NotFoundException. **(45min)**

### Fase D — E2E tests

- [x] **T6.2.D1** — E2E test `test/e2e/t6-soft-deletes.e2e-spec.ts`: `DELETE /incidents/:id` → 204 + fila con `deleted_at IS NOT NULL` + `GET /:id` → 404 + `status_history` sobrevive + `assignments` sobreviven. **(2h)**
- [x] **T6.2.D2** — E2E test `test/e2e/t6-soft-deletes.e2e-spec.ts`: `DELETE /assignments/:id` → 204 + fila con `deleted_at IS NOT NULL` + re-asignar mismo par → 201 (no viola UNIQUE). **(1.5h)**
- [x] **T6.2.D3** — `npm test && npm run test:e2e` verde. **(15min)**

---

## T6.3 — Columnas de métricas (P2, migración 0027)

### Fase A — Migración y entidad

- [x] **T6.3.A1** — Crear `database/migrations/0027_incidents_metrics_cols.sql`: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL, ADD COLUMN IF NOT EXISTS resolution_date TIMESTAMPTZ NULL` + índice en `resolution_date WHERE IS NOT NULL`. Crear rollback. **(30min)**
- [x] **T6.3.A2** — Actualizar `database/MIGRATION_LOG.md`: añadir fila 0027 como `⏳ Pending`. **(10min)**
- [x] **T6.3.A3** — En `entities/incident.entity.ts`: añadir `claimedAt: Date | null` y `resolutionDate: Date | null`. Añadir ambas a `SELECT_COLUMNS` en `incidents.repository.ts`. **(30min)**

### Fase B — Workflow service + repository

- [x] **T6.3.B1** — En `incidents/incidents-workflow.service.ts` o donde viva `claim()`: cambiar query `UPDATE incidents SET claimed_by = $2, updated_at = NOW()` → añadir `claimed_at = NOW()`. **(30min)**
- [x] **T6.3.B2** — En `incidents/incidents.repository.ts`, método `updateStatus()`: cambiar query para añadir `resolution_date = CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END`. **(30min)**
- [x] **T6.3.B3** — Unit tests: `claim()` → query incluye `claimed_at = NOW()`; `updateStatus('resolved')` → query incluye `resolution_date = NOW()`; `updateStatus('in_progress')` → query incluye `resolution_date = NULL`. **(1h)**

### Fase C — Eliminar computación inline de resolution_date

- [x] **T6.3.C1** — En `incidents/incident-feed.service.ts`: reemplazar `resolution_date: r.status === 'resolved' ? r.updated_at : null` por `resolution_date: r.resolution_date ?? null`. Asegurar que `resolution_date` está en el SELECT de la query del feed. **(30min)**
- [x] **T6.3.C2** — En `incidents/incident-export.service.ts`: reemplazar `row.status === 'resolved' ? row.updated_at.toISOString() : ''` por `row.resolution_date ? row.resolution_date.toISOString() : ''`. **(30min)**
- [x] **T6.3.C3** — Unit tests de regresión para FeedService y ExportService: resolver incident → resolution_date en body es la fecha correcta, no updated_at. **(1h)**

### Fase D — E2E tests

- [x] **T6.3.D1** — E2E test `test/e2e/t6-incident-metrics.e2e-spec.ts`: `POST /incidents/:id/claim` → GET incident → `claimed_at IS NOT NULL`. **(1h)**
- [x] **T6.3.D2** — E2E test `test/e2e/t6-incident-metrics.e2e-spec.ts`: status → `resolved` → `resolution_date IS NOT NULL`; reject flow (`in_progress`) → `resolution_date IS NULL`. **(1h)**
- [x] **T6.3.D3** — `npm test && npm run test:e2e` verde. **(15min)**

---

## T6.4 — Assignment role-change (P2, sin migración)

### Fase A — DTO + Service + Controller

- [x] **T6.4.A1** — En `assignments/dto/update-assignment.dto.ts`: añadir campo opcional `@IsOptional() @IsString() @IsIn(['primary', 'supervisor', 'observer']) role?: string`. Hacer `operator_id` opcional también (`@IsOptional`). Añadir validación de negocio: al menos uno de `operator_id` o `role` debe estar presente (usar `@ValidateIf` o validar en servicio). **(30min)**
- [x] **T6.4.A2** — En `assignments/assignments.service.ts`, método `update(id, dto)`: aceptar `UpdateAssignmentDto` completo. Si `dto.operator_id` → actualizar `operatorId`. Si `dto.role` → actualizar `role`. Si ninguno → `BadRequestException`. **(45min)**
- [x] **T6.4.A3** — En `assignments/assignments.controller.ts`: cambiar firma de `update()` para pasar `dto` completo al servicio. **(15min)**
- [x] **T6.4.A4** — Unit tests `assignments.service.spec.ts`: (a) `PATCH {role: 'supervisor'}` actualiza role; (b) `PATCH {operator_id}` actualiza operatorId (regresión); (c) `PATCH {}` → BadRequestException. **(1h)**
- [x] **T6.4.A5** — E2E test `test/e2e/t6-soft-deletes.e2e-spec.ts`: `PATCH /assignments/:id {role: 'supervisor'}` → 200 + role actualizado; `PATCH {operator_id}` → 200 (regresión); sin permiso → 403. **(1h)**
- [x] **T6.4.A6** — `npm test && npm run test:e2e` verde. **(15min)**

---

## T6.5 — Email OTP + columnas compliance (P2, migración 0028)

### Fase A — Migración y entidad

- [x] **T6.5.A1** — Crear `database/migrations/0028_users_otp_compliance.sql`: 6 columnas en `users` (`email_verified_at`, `verification_otp VARCHAR(64)`, `verification_otp_expires_at`, `terms_accepted_at`, `terms_version`, `deleted_at`). Crear rollback. **(45min)**
- [x] **T6.5.A2** — Actualizar `database/MIGRATION_LOG.md`: añadir fila 0028 como `⏳ Pending`. **(10min)**
- [x] **T6.5.A3** — En `entities/user.entity.ts`: añadir las 6 columnas con decoradores `@Column`. **(30min)**

### Fase B — Invitations: terms_accepted_at

- [x] **T6.5.B1** — En `invitations/dto/` (o donde esté el DTO de redención): añadir campo opcional `@IsOptional() @IsString() terms_version?: string`. **(15min)**
- [x] **T6.5.B2** — En `invitations/invitations.service.ts`, método `redeem()`: si `dto.terms_version` → añadir `termsAcceptedAt: new Date(), termsVersion: dto.terms_version` al update del usuario. **(30min)**
- [x] **T6.5.B3** — Unit tests: `redeem()` con `terms_version` escribe ambas columnas; sin `terms_version` → ambas quedan NULL. **(45min)**

### Fase C — EmailVerificationService

- [x] **T6.5.C1** — Crear `auth/email-verification.service.ts`:
  - `generateAndSendOtp(userId)`: genera 6 dígitos random, hashea SHA-256, escribe `verification_otp` (hash), `verification_otp_expires_at = NOW() + 15min`. Encola email al outbox (Redis Stream `mail:outbox`). Llama a `assertRateLimit()` antes de generar.
  - `verifyOtp(userId, otp)`: busca user, compara SHA-256(otp) con `verification_otp`, verifica `verification_otp_expires_at > NOW()`, setea `email_verified_at = NOW()`, limpia OTP cols.
  - `assertRateLimit(user)`: lanza `TooManyRequestsException` si `verification_otp_expires_at > NOW() - 60s`. **(3h)**
- [x] **T6.5.C2** — Unit tests `email-verification.service.spec.ts`: OTP correcto → verifica; OTP incorrecto → 422; expirado → 422; sin OTP pendiente → 422; rate limit → 429; ya verificado → 422 en resend. **(2h)**

### Fase D — EmailVerificationController

- [x] **T6.5.D1** — Crear `auth/email-verification.controller.ts`:
  - `POST /email/verify-otp` — protegido con `JwtAuthGuard`; body `{ otp: string }` → llama `verifyOtp()` → 200.
  - `POST /email/resend-verification` — protegido; llama `generateAndSendOtp()` → 202. **(1.5h)**
- [x] **T6.5.D2** — Registrar `EmailVerificationService` y `EmailVerificationController` en `AuthModule` (o crear `EmailVerificationModule` propio). **(30min)**
- [x] **T6.5.D3** — E2E test `test/e2e/email-verification.e2e-spec.ts`: (a) resend → genera OTP en DB; (b) verify con OTP correcto → email_verified_at seteado; (c) verify OTP expirado → 422; (d) rate limit → 429; (e) sin auth → 401 (resend y verify-otp). **(2h)**
- [x] **T6.5.D4** — `npm test && npm run test:e2e` verde. **(15min)**

---

## T6.6 — Incident image upload (P3, migración 0029)

### Fase A — Migración y entidad

- [x] **T6.6.A1** — Crear `database/migrations/0029_incident_images.sql`: tabla `incident_images` (id, incident_id FK CASCADE, storage_key, url, mime_type, file_size, created_at) + índice + permisos `incident-images` CREATE/DELETE + grants en roles staff. Crear rollback. **(1h)**
- [x] **T6.6.A2** — Actualizar `database/MIGRATION_LOG.md`: añadir fila 0029 como `⏳ Pending`. **(10min)**
- [x] **T6.6.A3** — Crear `entities/incident-image.entity.ts`: `@Entity('incident_images')` con columnas `id, incidentId, storageKey, url, mimeType, fileSize, createdAt`. **(30min)**

### Fase B — Storage service

- [x] **T6.6.B1** — Crear `incidents/incident-image-storage.service.ts`: misma estructura que `CommentImageStorageService`. Métodos: `upload(incidentId, file)` → `{key, url}`, `getSignedUrl(key)`, `delete(key)`. Key pattern: `incidents/{incidentId}/{uuid}-{sanitizedName}`. Reutilizar interfaz `MulterFile` importada de `comment-image-storage.service.ts`. **(1h)**
- [x] **T6.6.B2** — Unit tests `incident-image-storage.service.spec.ts`: upload retorna key con prefix `incidents/{id}/`; special chars sanitizados; delete resuelve sin error. **(45min)**

### Fase C — Images service

- [x] **T6.6.C1** — Crear `incidents/incident-images.service.ts`: método `attachToIncident(incidentId, callerId, callerPermissions, files)` — busca incidente (404 si no), verifica ownership o `'CREATE incident-images'` en permissions (403 si no), valida MIME (`image/jpeg`, `image/png`, `image/webp`), hace upload y persiste fila. Método `removeFromIncident(incidentId, imageId, callerId, callerPermissions)` — busca imagen (404), verifica incidentId match (404), verifica ownership o `'DELETE incident-images'` (403), borra de storage (catch → log warning), borra fila DB. **(2.5h)**
- [x] **T6.6.C2** — Unit tests `incident-images.service.spec.ts`: happy path 2 imágenes → 2 DTOs; MIME inválido → 422; non-owner sin permiso → 403; staff con permiso → OK; S3 fallo en delete → igual borra fila DB; imageId de otro incidente → 404. **(2h)**

### Fase D — Controller + Module

- [x] **T6.6.D1** — Crear `incidents/incident-images.controller.ts`: `@Controller('incidents/:id/images')`. `@Post()` con `@UseInterceptors(FilesInterceptor('images', 5))` → llama `attachToIncident()` → 201. `@Delete(':imageId')` → llama `removeFromIncident()` → 204. **(1h)**
- [x] **T6.6.D2** — En `incidents/incidents.module.ts`: añadir `IncidentImageEntity` a `TypeOrmModule.forFeature`, registrar `IncidentImagesController`, `IncidentImagesService`, `IncidentImageStorageService` en `controllers` / `providers`. **(30min)**
- [x] **T6.6.D3** — E2E test `test/e2e/incident-images.e2e-spec.ts`: POST 2 JPEG → 201 + 2 filas DB; POST PDF → 422; POST 6 files → 400/422; non-owner → 403; POST wrong incident → 404; DELETE → 204 + fila borrada; DELETE wrong incidentId → 404; non-owner DELETE → 403; sin auth → 401. **(2h)**
- [x] **T6.6.D4** — `npm test && npm run test:e2e` verde. **(15min)**

---

## T6.7 — Export XLSX + Feed Recovery + SSE tombstone (P3)

### Fase A — Export XLSX

- [x] **T6.7.A1** — `pnpm add exceljs` (en `backend/`). Verificar que no rompe build: `npm run build`. **(15min)**
- [x] **T6.7.A2** — En `incidents/incident-export.service.ts`: añadir método `createXlsxStream(filters)` que usa `exceljs.stream.xlsx.WorkbookWriter` (streaming, mismas columnas que CSV). Extraer método factory `createExportStream(filters, format: 'csv'|'xlsx')` que devuelve `{stream, contentType, filename}`. **(2h)**
- [x] **T6.7.A3** — En `incidents/incidents.controller.ts`: añadir `@Get('exportar')` como segundo decorador en el endpoint `export`. Añadir `@Query('format') format: 'csv' | 'xlsx' = 'csv'` y pasar al servicio. **(30min)**
- [x] **T6.7.A4** — Unit tests `incident-export.service.spec.ts`: `format='xlsx'` retorna buffer con magic bytes Excel; `format='csv'` mantiene behavior existente. **(1h)**
- [x] **T6.7.A5** — E2E test `test/e2e/t6-export-feed.e2e-spec.ts`: `GET /incidents/export?format=xlsx` → 200 + Content-Type correcto + body no vacío; `/incidents/exportar?format=csv` → mismo Content-Type que `/export?format=csv`. **(1h)**

### Fase B — SSE tombstone

- [x] **T6.7.B1** — En `notifications/notifications.controller.ts`: añadir `@Get('stream')` con `@HttpCode(410)` que retorna `{ message: 'This endpoint has been replaced by Socket.IO realtime events. See /api/docs for details.' }`. **(15min)**
- [x] **T6.7.B2** — E2E test `test/e2e/t6-notifications.e2e-spec.ts`: `GET /notifications/stream` → 410 + body con message. **(20min)**

### Fase C — Feed Recovery

- [x] **T6.7.C1** — `pnpm add @nestjs/schedule` (en `backend/`). Añadir `ScheduleModule.forRoot()` en `AppModule`. **(15min)**
- [x] **T6.7.C2** — Crear `incidents/feed-recovery.service.ts`: método `rebuildFeed(limit = 200)` — borra la key de feed en Redis, lee los `limit` incidentes más recientes de Postgres (sin filtro de org, solo `deleted_at IS NULL`), los inserta en el feed Redis con el mismo formato que `IncidentFeedService`. Retorna count de items insertados. Método `@Cron('0 3 * * *')` que llama `rebuildFeed()`. **(2h)**
- [x] **T6.7.C3** — Endpoint admin en `IncidentsController` (o `AdminController`): `@Post('admin/feed/rebuild')` con role check `admin_sistema` → llama `feedRecovery.rebuildFeed()` → 202 `{ rebuilt: count }`. **(30min)**
- [x] **T6.7.C4** — Registrar `FeedRecoveryService` en `IncidentsModule`. **(10min)**
- [x] **T6.7.C5** — Unit tests `feed-recovery.service.spec.ts`: `rebuildFeed()` llama Redis del(feedKey) + inserta N items + retorna count. **(1h)**
- [x] **T6.7.C6** — E2E test `test/e2e/t6-export-feed.e2e-spec.ts`: `POST /incidents/admin/feed/rebuild` → 202 `{rebuilt: number}` como `admin_sistema`; sin rol admin → 403. **(45min)**
- [x] **T6.7.C7** — `npm test && npm run test:e2e` verde. **(15min)**

---

## T6.8 — Path aliases + GDPR UserAnonymizer (P4)

### Fase A — Path aliases

- [x] **T6.8.A1** — En `menus/menus.controller.ts`: añadir `@Get('my')` como segundo decorador al método existente `@Get()`. **(10min)**
- [x] **T6.8.A2** — En `invitations/invitations.controller.ts`: añadir `@Post('invitations/accept')` que llama a `invitationsService.redeem()` + `authService.issueSessionForNewIdentity()` (mismo body que `POST /auth/accept-invitation`, usando forwardRef AuthService). **(30min)**
- [x] **T6.8.A3** — En `invitations/invitations.controller.ts`: añadir `@Get('invitations/:token/preview')` que llama a `invitationsService.previewInvitation(token)` (convertir el `token` del path param al mismo flujo que `GET /preview?token=`). **(30min)**
- [x] **T6.8.A4** — Añadir ruta `/estados`: `GET /incidents/statuses` en `IncidentsController` + `GET /estados` en `AppController` que delegan a `IncidentsService.getStatuses()`. **(45min)**
- [x] **T6.8.A5** — E2E tests `test/e2e/t6-aliases-gdpr.e2e-spec.ts`: `GET /menus/my`, `POST /invitations/accept`, `GET /invitations/{token}/preview`, `GET /estados` → mismas respuestas que las rutas originales; `/estados` mismos IDs que `/incidents/statuses`. **(1.5h)**

### Fase B — GDPR UserAnonymizer

- [x] **T6.8.B1** — Verificar que `entities/user.entity.ts` tiene `deletedAt: Date | null` (añadido en T6.5.A3); si no fue añadida allí, añadirla ahora. **(10min)**
- [x] **T6.8.B2** — En `users/users.service.ts`, método `softDelete(id)`: reemplazar implementación actual (que solo hace `isActive=false`) con: busca user → NotFoundException si no existe → `update` con `{ deletedAt: new Date(), isActive: false, firstName: 'Usuario eliminado', lastName: null, email: 'deleted+{id}@tase.invalid', avatarUrl: null, passwordHash: null, deviceUuid: null, verificationOtp: null, verificationOtpExpiresAt: null }`. **(1h)**
- [x] **T6.8.B3** — En `auth/auth.service.ts`: en la query `getAuthContextByUserId` añadir `AND u.deleted_at IS NULL AND u.is_active = TRUE`. El usuario eliminado no debe poder autenticarse. **(45min)**
- [x] **T6.8.B4** — En `users/users.service.ts`: añadir `deletedAt: IsNull()` a `findById` para que `GET /users/:id` retorne 404 para usuarios eliminados. **(30min)**
- [x] **T6.8.B5** — Unit tests `users.service.spec.ts`: `softDelete()` llama update con PII wipe + deletedAt; `findById()` de usuario eliminado → null → NotFoundException. **(1.5h)**

### Fase C — POST /register tombstone

- [x] **T6.8.C1** — En `auth/auth.controller.ts`: añadir `@Post('register')` que retorna 410 Gone con body `{ message: 'Registration is invitation-only. Contact an administrator.' }`. **(15min)**

### Fase D — E2E + cierre

- [x] **T6.8.D1** — E2E test `test/e2e/t6-aliases-gdpr.e2e-spec.ts`: `DELETE /users/:id` → 204 + fila con `deleted_at IS NOT NULL` + PII anonimizado + `GET /users/:id` → 404 + login con credenciales originales → 401. **(2h)**
- [x] **T6.8.D2** — E2E test `test/e2e/t6-aliases-gdpr.e2e-spec.ts`: `POST /auth/register` → 410. **(15min)**
- [x] **T6.8.D3** — `npm test && npm run test:e2e` verde — suite completa post T6.8. **(15min)**

---

## Checklist de cierre

- [x] Todas las tareas T6.1–T6.8 marcadas `[x]`
- [x] `npm run lint` sin errores (0 errors, 19 pre-existing warnings de `no-explicit-any` en specs, fuera de alcance)
- [x] `npm run typecheck` sin errores
- [x] `npm run build` exitoso
- [x] `npm test` verde (unit) — 823/823 passing
- [x] `npm run test:e2e` verde (e2e) — 242/242 passing, 29/29 suites
- [x] `database/MIGRATION_LOG.md` actualizado con 0025-0029 (`⏳ Pending`)
- [x] Migraciones 0025-0029 revisadas y listas para apply manual en Supabase

---

## Estimación de esfuerzo

| Group | Estimado |
|---|---|
| T6.1 Fix API | ~6h |
| T6.2 Soft Deletes | ~8h |
| T6.3 Métricas | ~5h |
| T6.4 Assignment role | ~2.5h |
| T6.5 Email OTP | ~10h |
| T6.6 Incident images | ~9h |
| T6.7 Export + Feed | ~8h |
| T6.8 Aliases + GDPR | ~7h |
| **Total** | **~55h** |
