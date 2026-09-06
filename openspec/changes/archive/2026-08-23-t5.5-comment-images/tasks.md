# Tasks: T5.5 Comment Images — Upload / Delete Adjuntos en Comentarios

Source: `proposal.md`, `specs/comment-images/spec.md`, `design.md`.
Migration: **0020**. Strict TDD. Run `npm test` baseline before Phase 1.

## Phase 1: Migration

- [x] 1.1 Create `database/migrations/0020_comment_images.sql`:
      - `comment_images (id uuid PK, comment_id uuid FK→comments ON DELETE CASCADE,
        storage_key varchar(500), url varchar(1000), mime_type varchar(100),
        file_size int CHECK (>0), created_at timestamptz DEFAULT now())`.
      - `INDEX idx_comment_images_comment ON comment_images (comment_id)`.
      - Permission rows: `INSERT INTO permissions (action, resource) VALUES ('CREATE','comment-images'),('DELETE','comment-images')`.
      - Grant both permissions to `operador_organizacion`, `operador_sistema`,
        `admin_organizacion`, `admin_sistema` via `role_permissions`.
- [x] 1.2 Create `database/rollback/0020_comment_images.DOWN.sql`:
      - Remove permission grants, remove permission rows, DROP TABLE `comment_images`.
- [x] 1.3 Apply 0020 to local Postgres; verify `comment_images` table is created.
- [x] 1.4 Add entry to `database/MIGRATION_LOG.md`.

## Phase 2: Entity

- [x] 2.1 Create `backend/src/entities/comment-image.entity.ts` — `@Entity('comment_images')`
      with all columns from the migration: `id`, `commentId`, `storageKey`, `url`, `mimeType`,
      `fileSize`, `createdAt`.

## Phase 3: Storage Service

- [x] 3.1 Create `backend/src/modules/comments/comment-image-storage.service.ts` following the
      `AvatarStorageService` pattern:
      - `upload(commentId: string, file: Express.Multer.File): Promise<{key: string, url: string}>`:
        key = `comments/{commentId}/{randomUUID()}-{sanitizedOriginalname}`.
        `sanitizedOriginalname` replaces non-alphanumeric chars (except `.` `-` `_`) with `_`.
        Return `{key, url: this.getSignedUrl(key)}`.
      - `getSignedUrl(key: string): string` — same SHA-256-based placeholder as `AvatarStorageService`.
      - `delete(key: string): Promise<void>` — no-op stub; real S3 `DeleteObjectCommand` plugs in here.

## Phase 4: Unit Tests (Storage Service)

- [x] 4.1 `backend/src/modules/comments/comment-image-storage.service.spec.ts`:
      - `upload`: returned key starts with `comments/{commentId}/`.
      - `upload`: `originalname` with special chars is sanitized in the key.
      - `getSignedUrl`: returns a deterministic URL for the same key.
      - `delete`: resolves without throwing (stub behavior).

## Phase 5: Comment Images Service

- [x] 5.1 Create `backend/src/modules/comments/comment-images.service.ts` injecting:
      - `@InjectRepository(CommentEntity) commentRepo`
      - `@InjectRepository(CommentImageEntity) imageRepo`
      - `CommentImageStorageService`
      - `Logger`
- [x] 5.2 Implement `attachToComment(commentId, callerId, callerPermissions, files)`:
      - Load comment (NotFoundException if not found).
      - Ownership/permission check (ForbiddenException if fails).
      - Validate MIME types against allowlist `['image/jpeg','image/png','image/gif','image/webp']`
        (UnprocessableEntityException on invalid type).
      - For each file: `storage.upload(commentId, file)` → on error throw (no DB insert).
      - `imageRepo.save(...)` for each uploaded file.
      - Return mapped `CommentImageDto[]`.
- [x] 5.3 Implement `removeFromComment(commentId, imageId, callerId, callerPermissions)`:
      - Load image by `imageId` (NotFoundException if not found).
      - Check `image.commentId === commentId` (NotFoundException if mismatch).
      - Load comment, check ownership/permission (ForbiddenException if fails).
      - `try { await storage.delete(image.storageKey) } catch (e) { logger.warn(...) }`.
      - `imageRepo.delete({ id: imageId })`.

## Phase 6: Unit Tests (Comment Images Service)

- [x] 6.1 `backend/src/modules/comments/comment-images.service.spec.ts`:
      - `attachToComment` happy path: returns array of 2 DTOs after uploading 2 files.
      - `attachToComment` non-owner without permission: throws ForbiddenException.
      - `attachToComment` user with `CREATE comment-images` permission but non-owner: succeeds.
      - `attachToComment` invalid MIME: throws UnprocessableEntityException.
      - `attachToComment` comment not found: throws NotFoundException.
      - `removeFromComment` happy path: calls storage.delete + imageRepo.delete.
      - `removeFromComment` S3 failure: still calls imageRepo.delete, logs warning.
      - `removeFromComment` image belongs to different comment: throws NotFoundException.
      - `removeFromComment` non-owner: throws ForbiddenException.

## Phase 7: Controller

- [x] 7.1 Create `backend/src/modules/comments/comment-images.controller.ts`:
      - `@Controller('comments/:id/images')`, `@UseGuards(JwtAuthGuard)`.
      - `@Post()` with `@UseInterceptors(FilesInterceptor('images', 5, { limits: { fileSize: 5 * 1024 * 1024 } }))`
        → call `commentImagesService.attachToComment(id, user.id, user.permissions, files)`
        → 201.
      - `@Delete(':imageId')` → call `commentImagesService.removeFromComment(id, imageId, user.id, user.permissions)`
        → 204 (no body).
- [x] 7.2 Create `backend/src/modules/comments/dto/comment-image.dto.ts` with
      `id`, `url`, `mimeType`, `fileSize`, `createdAt`.
- [x] 7.3 Register `CommentImagesController`, `CommentImagesService`, `CommentImageStorageService`,
      and `TypeOrmModule.forFeature([CommentImageEntity])` in
      `backend/src/modules/comments/comments.module.ts`.

## Phase 8: E2E Tests

- [x] 8.1 `backend/test/e2e/comment-images.e2e-spec.ts`:
      - Seed user + incident + comment owned by the user.
      - POST 2 JPEG files → 201, response array has 2 items, DB has 2 rows.
      - POST with 6 files → 422 (Multer limit).
      - POST with a PDF file → 422 (MIME type check).
      - Non-owner user POST → 403.
      - DELETE image by owner → 204, DB row gone.
      - DELETE image with wrong comment ID → 404.
      - Non-owner DELETE → 403.
      - Unauthenticated → 401.

## Phase 9: Lint + Type Check

- [x] 9.1 `npm run lint` — zero new violations.
- [x] 9.2 `npm run typecheck` — no errors.
- [x] 9.3 `npm run build` — clean.
- [x] 9.4 `npm test && npm run test:e2e` — full suite green.
