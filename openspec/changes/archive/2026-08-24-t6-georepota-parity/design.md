# Design: T6 — GeoReporta Parity Gaps

**Change**: t6-georepota-parity  
**Date**: 2026-08-23  

---

## Contexto del codebase (hallazgos de codegraph)

Los siguientes hechos fueron verificados con el índice codegraph del backend. Cualquier decisión de diseño parte de estos puntos, no de suposiciones:

- `NotificationsController.countUnread`: ruta `GET /notifications/unread`, retorna `{ unread: count }`. Key es `unread`, no `unread_count`.
- `OrganizationsController.getNotifiedFor`: ruta `GET /organizations/notified-for`, acepta `@Query('lat', ParseFloatPipe)` + `@Query('lng', ParseFloatPipe)`. Sin `is_claimable` en respuesta.
- `IncidentsService.softDelete`: **stub no-op**. Escribe de vuelta los mismos valores (title, description, categoryId) sin escribir `deleted_at`. No existe `deleted_at` en la tabla ni en `IncidentEntity`.
- `AssignmentsService.release`: **hard delete** con `assignmentRepo.delete(assignmentId)`. No existe `deleted_at` en `AssignmentEntity`.
- `AssignmentEntity.role`: columna `role varchar DEFAULT 'primary'` existe, pero `UpdateAssignmentDto` solo acepta `operator_id`.
- `IncidentEntity`: sin `claimed_at`, sin `resolution_date`. `claim()` solo escribe `claimed_by`.
- `IncidentExportService` y `IncidentFeedService`: computan `resolution_date` como `updated_at` donde `status='resolved'` — código inline, no columna real.
- `UserEntity`: sin `email_verified_at`, `verification_otp`, `verification_otp_expires_at`, `terms_accepted_at`, `terms_version`, `deleted_at`.
- Sin `IncidentImagesService`, sin `IncidentImageEntity`, sin tabla `incident_images`.
- `CommentImageStorageService` y `CommentImagesService` existen — seguir ese patrón para incident images.
- Export usa raw Node.js `Readable` stream; sin `exceljs`, sin `fast-csv`. Solo CSV.
- Sin `@nestjs/schedule` instalado.
- Sin endpoint SSE en ningún controller.
- Proyecto usa manual `timestamp` columns (no TypeORM `@DeleteDateColumn`). Patrón establecido: columna `timestamptz NULL` + raw SQL `WHERE deleted_at IS NULL`.

---

## T6.1 — Fix críticos de API

### D1.1 — Notifications unread-count

Añadir ruta adicional en `NotificationsController`. Opción elegida: **doble decorador en el mismo método**, no método separado.

```typescript
// notifications.controller.ts
@Get('unread')
@Get('unread-count')   // ← alias nuevo
async countUnread(@Req() req: AuthenticatedRequest) {
  const userId = req.user!.userId;
  const count = await this.notificationsService.countUnread(userId);
  return { unread_count: count };   // ← key cambia de 'unread' a 'unread_count'
}
```

> **Nota**: cambiar el key de `unread` a `unread_count` es breaking para cualquier cliente que use la ruta `/notifications/unread`. Aceptable porque ese cliente (GeoReporta) ya esperaba `unread_count`. Clientes nuevos de TASE que pudieran usar la ruta vieja deben actualizarse.

### D1.2 — Organizations notified-for: input dual

El servicio `notifiedFor` acepta solo `{lat, lng}` porque llama a `geofencingService.resolveZone({lat, lng})`. Para aceptar `location_id`, resolvemos la zona directamente desde la tabla `geo_zones` por ID, sin geofencing.

**Nuevo contrato de query params** (todos opcionales salvo que se requiera uno de los dos grupos):

```typescript
export class NotifiedForQueryDto {
  // Grupo A: coordenadas GPS directas
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  // Grupo B: IDs del cascading dropdown GeoReporta
  @IsOptional()
  @IsUUID()
  location_id?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;  // por ahora solo para log/futura categorización; no filtra orgs
}
```

**Lógica de resolución en `OrganizationsService.notifiedFor`**:

```typescript
async notifiedFor(query: NotifiedForQueryDto): Promise<OrganizationWithClaimable[]> {
  let zoneId: string | null = null;

  if (query.location_id) {
    // Grupo B: lookup directo por ID de zona
    zoneId = query.location_id;
  } else if (query.lat !== undefined && query.lng !== undefined) {
    // Grupo A: geofencing
    const { zone } = await this.geofencingService.resolveZone({ lat: query.lat, lng: query.lng });
    zoneId = zone?.id ?? null;
  } else {
    throw new BadRequestException('Provide lat+lng or location_id');
  }

  if (!zoneId) return [];
  const org = await this.repo.findByZone(zoneId);
  if (!org) return [];

  return [{ ...org, is_claimable: org.max_active_claims > 0 }];
}
```

**Tipo de respuesta extendido**:

```typescript
export interface OrganizationWithClaimable extends OrganizationRow {
  is_claimable: boolean;
}
```

`max_active_claims` ya existe en `organizations` (migration 0019). `is_claimable` es simplemente `max_active_claims > 0`.

---

## T6.2 — Soft Deletes

### D2.1 — Migration 0025: incidents_soft_delete

```sql
BEGIN;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_deleted_at
  ON incidents (deleted_at)
  WHERE deleted_at IS NULL;

COMMIT;
```

### D2.2 — Migration 0026: assignments_soft_delete

```sql
BEGIN;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Eliminar UNIQUE constraint existente si lo hay (verificar antes del apply)
-- y recrear como partial UNIQUE
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_incident_id_operator_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_active
  ON assignments (incident_id, operator_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_deleted_at
  ON assignments (deleted_at)
  WHERE deleted_at IS NULL;

COMMIT;
```

### D2.3 — IncidentEntity: columna deleted_at

```typescript
// src/entities/incident.entity.ts — añadir columna
@Column({ type: 'timestamptz', nullable: true, default: null })
deletedAt: Date | null;
```

### D2.4 — AssignmentEntity: columna deleted_at

```typescript
// src/entities/assignment.entity.ts — añadir columna
@Column({ type: 'timestamptz', nullable: true, default: null })
deletedAt: Date | null;
```

### D2.5 — Patrón de filtro en IncidentsRepository

Todos los métodos existentes que hacen `WHERE ... (sin filtro deleted)` deben añadir:

```sql
-- En queries raw SQL:
AND incidents.deleted_at IS NULL

-- En TypeORM findOne/find:
where: { ..., deletedAt: IsNull() }
```

Archivos afectados (verificados en codegraph):
- `incidents.repository.ts`: `findOne()`, `findAll()`, `count()`, cualquier query de lista
- `incidents.service.ts`: `softDelete()` — reemplazar stub con:

```typescript
async softDelete(id: string): Promise<void> {
  const incident = await this.incidentsRepository.findOne(id, scope);
  if (!incident) throw new NotFoundException(`Incident ${id} not found`);
  await this.dataSource.query(
    `UPDATE incidents SET deleted_at = NOW() WHERE id = $1`,
    [id],
  );
}
```

### D2.6 — AssignmentsService.release

Reemplazar hard delete:

```typescript
// ANTES
async release(id: string): Promise<void> {
  await this.assignmentRepo.delete(id);
}

// DESPUÉS
async release(id: string): Promise<void> {
  const assignment = await this.assignmentRepo.findOne({ where: { id } });
  if (!assignment) throw new NotFoundException(`Assignment ${id} not found`);
  await this.assignmentRepo.update(id, { deletedAt: new Date() });
}
```

---

## T6.3 — Columnas de métricas

### D3.1 — Migration 0027: incidents_metrics_cols

```sql
BEGIN;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS resolution_date TIMESTAMPTZ NULL;

COMMENT ON COLUMN incidents.claimed_at IS 'Timestamp del último claim; no se borra en release (historial)';
COMMENT ON COLUMN incidents.resolution_date IS 'Timestamp cuando el incidente pasó a resolved; NULL si vuelve a in_progress';

CREATE INDEX IF NOT EXISTS idx_incidents_resolution_date
  ON incidents (resolution_date)
  WHERE resolution_date IS NOT NULL;

COMMIT;
```

### D3.2 — IncidentEntity: columnas nuevas

```typescript
@Column({ type: 'timestamptz', nullable: true, default: null })
claimedAt: Date | null;

@Column({ type: 'timestamptz', nullable: true, default: null })
resolutionDate: Date | null;
```

### D3.3 — IncidentWorkflowService.claim() — escribir claimed_at

```typescript
// Añadir a la query UPDATE del claim:
`UPDATE incidents SET claimed_by = $2, claimed_at = NOW(), updated_at = NOW() WHERE id = $1`
```

### D3.4 — IncidentsRepository.updateStatus() — escribir resolution_date

```typescript
// Cambiar la query existente:
`UPDATE incidents
 SET status = $2,
     updated_at = NOW(),
     resolution_date = CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END
 WHERE id = $1
 RETURNING ${SELECT_COLUMNS}`
```

`CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END` cubre dos casos:
- Al pasar a `resolved`: escribe `resolution_date = NOW()`
- Al pasar a `in_progress` (reject flow): escribe `resolution_date = NULL`

### D3.5 — Eliminar computación inline de resolution_date

`IncidentExportService` y `IncidentFeedService` computan `resolution_date` como `updated_at`. Una vez que la columna real existe, reemplazar:

```typescript
// ANTES (IncidentExportService CSV):
const resDate = row.status === 'resolved' ? row.updated_at.toISOString() : '';

// DESPUÉS:
const resDate = row.resolution_date ? row.resolution_date.toISOString() : '';
```

Asegurarse que `SELECT_COLUMNS` en `incidents.repository.ts` incluye `resolution_date` y `claimed_at`.

---

## T6.4 — Assignment role-change

### D4.1 — UpdateAssignmentDto extendido

```typescript
// dto/update-assignment.dto.ts
export class UpdateAssignmentDto {
  @IsOptional()
  @IsUUID()
  operator_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(['primary', 'supervisor', 'observer'])
  role?: string;
}
```

> `operator_id` pasa de requerido a opcional — al menos uno de los dos debe estar presente (validar en servicio o con `@ValidateIf`).

### D4.2 — AssignmentsService.update extendido

```typescript
async update(id: string, dto: UpdateAssignmentDto): Promise<AssignmentEntity> {
  const existing = await this.assignmentRepo.findOne({ where: { id } });
  if (!existing) throw new NotFoundException(`Assignment ${id} not found`);
  if (!dto.operator_id && !dto.role) {
    throw new BadRequestException('Provide operator_id and/or role');
  }
  if (dto.operator_id) existing.operatorId = dto.operator_id;
  if (dto.role)        existing.role = dto.role;
  return this.assignmentRepo.save(existing);
}
```

### D4.3 — AssignmentsController.update

```typescript
@Patch(':id')
@RequirePermission('UPDATE')
update(
  @Param('id') id: string,
  @Body() dto: UpdateAssignmentDto,
): Promise<AssignmentEntity> {
  return this.assignmentsService.update(id, dto);
}
```

---

## T6.5 — Email OTP + columnas compliance

### D5.1 — Migration 0028: users_otp_compliance

```sql
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS verification_otp VARCHAR(6) NULL,
  ADD COLUMN IF NOT EXISTS verification_otp_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Rate-limit check: index en user_id para buscar por usuario rápido
CREATE INDEX IF NOT EXISTS idx_users_email_verified_at
  ON users (email_verified_at)
  WHERE email_verified_at IS NULL;

COMMIT;
```

> `deleted_at` en users incluida aquí para que T6.8 (GDPR anonymizer) no necesite migración separada.

### D5.2 — UserEntity: columnas nuevas

```typescript
@Column({ type: 'timestamptz', nullable: true, default: null })
emailVerifiedAt: Date | null;

@Column({ type: 'varchar', length: 6, nullable: true, default: null })
verificationOtp: string | null;

@Column({ type: 'timestamptz', nullable: true, default: null })
verificationOtpExpiresAt: Date | null;

@Column({ type: 'timestamptz', nullable: true, default: null })
termsAcceptedAt: Date | null;

@Column({ type: 'varchar', length: 20, nullable: true, default: null })
termsVersion: string | null;

@Column({ type: 'timestamptz', nullable: true, default: null })
deletedAt: Date | null;
```

### D5.3 — InvitationsService.redeem: escribir terms_accepted_at

```typescript
// Añadir al DTO de redención:
export class RedeemInvitationDto {
  @IsString() token!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() terms_version?: string;
}

// En redeem():
await this.usersRepo.update(userId, {
  passwordHash: hashed,
  ...(dto.terms_version ? {
    termsAcceptedAt: new Date(),
    termsVersion: dto.terms_version,
  } : {}),
});
```

### D5.4 — EmailVerificationService

```typescript
// src/modules/auth/email-verification.service.ts
export class EmailVerificationService {
  // Genera OTP de 6 dígitos, guarda hash SHA-256 en users, encola email
  async generateAndSendOtp(userId: string): Promise<void>

  // Verifica OTP: compara con hash, valida expiry, limpia columnas, setea email_verified_at
  async verifyOtp(userId: string, otp: string): Promise<void>
    // throws UnprocessableEntityException si OTP inválido o expirado

  // Rate limit: lanza TooManyRequestsException si verification_otp_expires_at > NOW() - 60s
  private assertRateLimit(user: UserEntity): void
}
```

**OTP storage**: guardar el OTP en claro en `verification_otp` (6 dígitos) para simplificar — bcrypt es excesivo para OTP de 15 min TTL. Si se quiere más seguridad, SHA-256 hex del OTP. El OTP en el email es el valor en claro; en DB el hash.

**TTL**: 15 minutos desde generación.

**Rate limit**: no permitir re-envío si `verification_otp_expires_at > NOW() - 60s` (OTP emitido hace menos de 60 segundos).

### D5.5 — EmailVerificationController

```typescript
// src/modules/auth/email-verification.controller.ts
@Controller('email')
@UseGuards(JwtAuthGuard)
export class EmailVerificationController {
  @Post('verify-otp')
  // body: { otp: string }
  // → 200 si OK, 422 si OTP inválido/expirado

  @Post('resend-verification')
  // → 202 Accepted si email encolado
  // → 429 si rate limit hit
  // → 422 si ya verificado
}
```

---

## T6.6 — Incident image upload

### D6.1 — Migration 0029: incident_images

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS incident_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id   UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  storage_key   TEXT NOT NULL,
  url           TEXT NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  file_size     BIGINT NOT NULL CHECK (file_size > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_images_incident_id
  ON incident_images (incident_id);

-- Permisos
INSERT INTO permissions (id, resource, action, description)
VALUES
  (gen_random_uuid(), 'incident-images', 'CREATE', 'Upload images to incidents'),
  (gen_random_uuid(), 'incident-images', 'DELETE', 'Delete images from incidents')
ON CONFLICT DO NOTHING;

-- Grants a roles staff (mismos que comment-images en 0024)
UPDATE roles SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT elem FROM roles, jsonb_array_elements(permissions) AS elem
    WHERE name = 'operador_organizacion'
    UNION ALL
    SELECT '"incident-images:CREATE"'::jsonb
    UNION ALL
    SELECT '"incident-images:DELETE"'::jsonb
  ) sub
) WHERE name = 'operador_organizacion';

UPDATE roles SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT elem FROM roles, jsonb_array_elements(permissions) AS elem
    WHERE name = 'admin_organizacion'
    UNION ALL
    SELECT '"incident-images:CREATE"'::jsonb
    UNION ALL
    SELECT '"incident-images:DELETE"'::jsonb
  ) sub
) WHERE name = 'admin_organizacion';

COMMIT;
```

### D6.2 — IncidentImageEntity

```typescript
// src/entities/incident-image.entity.ts
@Entity('incident_images')
export class IncidentImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId!: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ type: 'text' })
  url!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
```

### D6.3 — IncidentImageStorageService

Copiar exactamente `CommentImageStorageService`:

```typescript
// src/modules/incidents/incident-image-storage.service.ts
export class IncidentImageStorageService {
  async upload(incidentId: string, file: MulterFile): Promise<{ key: string; url: string }>
  getSignedUrl(key: string): string
  async delete(key: string): Promise<void>
}
// Key pattern: incidents/{incidentId}/{uuid}-{sanitizedFilename}
// MulterFile: import from comment-image-storage.service.ts (re-export o copiar interfaz)
```

### D6.4 — IncidentImagesService

```typescript
// src/modules/incidents/incident-images.service.ts
export class IncidentImagesService {
  // Sube hasta 5 imágenes; valida MIME; verifica ownership o permiso CREATE incident-images
  async attachToIncident(
    incidentId: string,
    callerId: string,
    callerPermissions: string[],
    files: MulterFile[],
  ): Promise<IncidentImageDto[]>

  // Elimina imagen; valida ownership/permiso DELETE incident-images; S3 fallo → log warning
  async removeFromIncident(
    incidentId: string,
    imageId: string,
    callerId: string,
    callerPermissions: string[],
  ): Promise<void>
}
```

### D6.5 — IncidentImagesController

```typescript
// POST /api/incidents/:id/images
// DELETE /api/incidents/:id/images/:imageId
@Controller('incidents/:id/images')
export class IncidentImagesController { ... }
```

**Registrar en `IncidentsModule`** junto con `IncidentImageEntity` y los dos servicios nuevos.

### D6.6 — IncidentImageDto

```typescript
export class IncidentImageDto {
  id!: string;
  url!: string;
  mime_type!: string;
  file_size!: number;
  created_at!: Date;
}
```

---

## T6.7 — Export XLSX + Feed Recovery + SSE tombstone

### D7.1 — Export XLSX con exceljs

Instalar: `pnpm add exceljs` (solo en `backend/`).

**Patrón factory en IncidentExportService**:

```typescript
// format: 'csv' | 'xlsx' (default: 'csv')
async createExportStream(
  filters: ExportQueryDto,
  format: 'csv' | 'xlsx',
): Promise<{ stream: Readable; contentType: string; filename: string }>
```

Para XLSX: usar `exceljs.stream.xlsx.WorkbookWriter` (streaming writer — no carga todo en memoria). Mismo schema de columnas que el CSV: `id, title, status, priority, organization, category, created_at, resolution_date`.

**Controller — añadir `format` param**:

```typescript
@Get('export')
@Get('exportar')   // alias path
@RequirePermission('EXPORT')
async export(
  @Query() dto: ExportQueryDto,
  @Query('format') format: 'csv' | 'xlsx' = 'csv',
  @Res() res: Response,
) {
  const { stream, contentType, filename } = await this.exportService.createExportStream(dto, format);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  stream.pipe(res);
}
```

### D7.2 — Feed Recovery

Instalar: `pnpm add @nestjs/schedule` (solo en `backend/`).

```typescript
// src/modules/incidents/feed-recovery.service.ts
@Injectable()
export class FeedRecoveryService {
  // Reconstruye el feed Redis desde Postgres — borra feed key, re-inserta últimos N incidentes
  async rebuildFeed(limit = 200): Promise<number>   // retorna count de items insertados
}

// Admin endpoint — en IncidentsController o AdminController:
@Post('admin/feed/rebuild')
@RequirePermission('ADMIN')
async rebuildFeed() {
  const count = await this.feedRecovery.rebuildFeed();
  return { rebuilt: count };
}
```

**Cron opcional** (activo si `@nestjs/schedule` instalado):

```typescript
@Cron('0 3 * * *')  // 3am UTC daily
async scheduledFeedRebuild() { await this.feedRecovery.rebuildFeed(); }
```

### D7.3 — SSE tombstone

En `NotificationsController`:

```typescript
@Get('stream')
sseDeprecated(@Res() res: Response) {
  res.status(410).json({
    message: 'This endpoint has been replaced by Socket.IO realtime events. See /api/docs for details.',
  });
}
```

---

## T6.8 — Path aliases + GDPR

### D8.1 — Path aliases

| Controller | Añadir | Apunta a |
|---|---|---|
| `MenusController` | `@Get('my')` | mismo método que `@Get()` |
| `InvitationsController` | `@Post('accept')` | delega a `authService.acceptInvitation()` |
| `IncidentsController` | `@Get('statuses')` ya existe como `/incidents/statuses` — añadir también en top-level `/estados` | nuevo `EstadosController` o alias en app routing |
| `InvitationsController` | `@Get(':token/preview')` | delega a `invitationsService.previewByToken(token)` |

> `/estados` es un path top-level (sin prefix de módulo) — requiere un `EstadosController` separado o registrarlo a nivel de `AppModule` con el router.

### D8.2 — UsersService.softDelete: implementación real + PII wipe

```typescript
async softDelete(id: string): Promise<void> {
  const user = await this.usersRepo.findOne({ where: { id } });
  if (!user) throw new NotFoundException(`User ${id} not found`);
  await this.usersRepo.update(id, {
    deletedAt: new Date(),
    isActive: false,
    firstName: 'Usuario eliminado',
    lastName: null,
    email: `deleted+${id}@tase.invalid`,
    avatarUrl: null,
    passwordHash: null,
    deviceUuid: null,
    verificationOtp: null,
    verificationOtpExpiresAt: null,
  });
}
```

**AuthService/JwtStrategy**: añadir check `WHERE deleted_at IS NULL AND is_active = true` en `validateUser()` para que el usuario eliminado no pueda autenticarse.

### D8.3 — POST /register tombstone

En `AuthController`:

```typescript
@Post('register')
register(@Res() res: Response) {
  res.status(410).json({
    message: 'Registration is invitation-only. Contact an administrator.',
  });
}
```

---

## Resumen de archivos afectados

| Archivo | Cambio | Task |
|---|---|---|
| `notifications/notifications.controller.ts` | Doble `@Get` + key `unread_count` | T6.1 |
| `organizations/organizations.controller.ts` | `NotifiedForQueryDto` dual-input | T6.1 |
| `organizations/organizations.service.ts` | `notifiedFor()` acepta `location_id` | T6.1 |
| `database/migrations/0025_incidents_soft_delete.sql` | Nueva migración | T6.2 |
| `database/migrations/0026_assignments_soft_delete.sql` | Nueva migración | T6.2 |
| `entities/incident.entity.ts` | `deletedAt`, `claimedAt`, `resolutionDate` | T6.2/T6.3 |
| `entities/assignment.entity.ts` | `deletedAt` | T6.2 |
| `incidents/incidents.repository.ts` | Filtro `deleted_at IS NULL` en todas queries | T6.2 |
| `incidents/incidents.service.ts` | `softDelete()` real | T6.2 |
| `assignments/assignments.service.ts` | `release()` soft + `update()` con role | T6.2/T6.4 |
| `assignments/dto/update-assignment.dto.ts` | Añadir `role?` | T6.4 |
| `database/migrations/0027_incidents_metrics_cols.sql` | Nueva migración | T6.3 |
| `incidents/incidents-workflow.service.ts` | `claim()` escribe `claimed_at` | T6.3 |
| `incidents/incidents.repository.ts` | `updateStatus()` escribe `resolution_date` | T6.3 |
| `incidents/incident-export.service.ts` | Usar columna real `resolution_date` + XLSX | T6.3/T6.7 |
| `incidents/incident-feed.service.ts` | Usar columna real `resolution_date` | T6.3 |
| `database/migrations/0028_users_otp_compliance.sql` | Nueva migración | T6.5 |
| `entities/user.entity.ts` | 6 columnas nuevas (OTP + compliance + deleted_at) | T6.5/T6.8 |
| `invitations/invitations.service.ts` | `redeem()` escribe `termsAcceptedAt` | T6.5 |
| `auth/email-verification.service.ts` | Nuevo servicio | T6.5 |
| `auth/email-verification.controller.ts` | Nuevo controller | T6.5 |
| `database/migrations/0029_incident_images.sql` | Nueva migración | T6.6 |
| `entities/incident-image.entity.ts` | Nueva entidad | T6.6 |
| `incidents/incident-image-storage.service.ts` | Nuevo servicio | T6.6 |
| `incidents/incident-images.service.ts` | Nuevo servicio | T6.6 |
| `incidents/incident-images.controller.ts` | Nuevo controller | T6.6 |
| `incidents/incidents.module.ts` | Registrar entidad + servicios + controller | T6.6 |
| `notifications/notifications.controller.ts` | SSE tombstone 410 | T6.7 |
| `incidents/feed-recovery.service.ts` | Nuevo servicio | T6.7 |
| `auth/auth.controller.ts` | POST /register 410 | T6.8 |
| `menus/menus.controller.ts` | @Get('my') alias | T6.8 |
| `invitations/invitations.controller.ts` | POST accept alias + GET :token/preview | T6.8 |
| `users/users.service.ts` | `softDelete()` con PII wipe | T6.8 |
| `auth/auth.service.ts` o `jwt.strategy.ts` | Check `deleted_at IS NULL` | T6.8 |
