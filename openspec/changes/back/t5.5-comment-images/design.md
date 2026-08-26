# Design: T5.5 Comment Images — Upload / Delete Adjuntos en Comentarios

Source: `proposal.md`. Migration **0020**.

## Architecture Overview

```
POST /api/comments/:id/images
DELETE /api/comments/:id/images/:imageId
       │
CommentImagesController
  JwtAuthGuard + ownership check (service-level)
       ▼
CommentImagesService
  ├── attachToComment(commentId, userId, files[]) → CommentImageDto[]
  │     → CommentImageStorageService.upload(commentId, file)
  │     → INSERT INTO comment_images (multiple rows)
  └── removeFromComment(commentId, imageId, userId) → void
        → SELECT to validate belongs + ownership
        → CommentImageStorageService.delete(key) [graceful — warn on fail]
        → DELETE FROM comment_images WHERE id = :imageId
       │
CommentImageStorageService  ─── S3 (seam; same pattern as AvatarStorageService)
DataSource ─────────────────── comment_images table (migration 0020)
```

## Architecture Decisions

| # | Decision | Why not the alternative |
|---|---|---|
| **D1** | `CommentImageStorageService` is a separate class (not a generalized `StorageService`). | `AvatarStorageService` has no `delete()` method and uses a different key prefix. Unifying them prematurely adds an abstraction with no current consumers. Two concrete classes are cheaper to test. |
| **D2** | Upload first, then INSERT. On upload failure, throw before inserting. | No orphan DB row on S3 failure. The inverse (insert then upload) would leave a row pointing to a nonexistent key. |
| **D3** | Delete: attempt S3, log warning on failure, then delete DB row regardless. | Mirrors GeoReporta's `CommentImageController::destroy` exactly. The DB is the source of truth; an S3 orphan is a cost concern, not a correctness concern. |
| **D4** | `comment_images.comment_id` has `ON DELETE CASCADE`. | When a comment is deleted, its images are automatically removed from the DB. S3 objects become orphans (same as D3 — acceptable for T5.5; a GC job is out of scope). |
| **D5** | Ownership check: `comment.userId === caller.id || caller.hasPermission('CREATE comment-images')`. | Mirrors GeoReporta's `Gate::authorize('update', $comment)`. Permission-gated staff override is a common pattern for moderation. |
| **D6** | `FilesInterceptor('images', 5)` with `limits: { fileSize: 5 * 1024 * 1024 }` in Multer options. | Max 5 files, 5MB each. Exceeding either limit throws Multer's `LIMIT_UNEXPECTED_FILE` / `LIMIT_FILE_SIZE` which NestJS maps to 422. |

## TypeScript Contracts

```typescript
// Entity

@Entity('comment_images')
export class CommentImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'comment_id', type: 'uuid' })
  commentId!: string;

  @Column({ name: 'storage_key', type: 'varchar' })
  storageKey!: string;

  @Column({ type: 'varchar' })
  url!: string;

  @Column({ name: 'mime_type', type: 'varchar' })
  mimeType!: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

// DTOs

export class CommentImageDto {
  id!: string;
  url!: string;
  mimeType!: string;
  fileSize!: number;
  createdAt!: Date;
}

// Storage service

export interface UploadResult {
  key: string;
  url: string;
}

export interface ICommentImageStorageService {
  upload(commentId: string, file: Express.Multer.File): Promise<UploadResult>;
  delete(key: string): Promise<void>;
}

// Service interface

export interface ICommentImagesService {
  attachToComment(
    commentId: string,
    callerId: string,
    callerPermissions: string[],
    files: Express.Multer.File[],
  ): Promise<CommentImageDto[]>;

  removeFromComment(
    commentId: string,
    imageId: string,
    callerId: string,
    callerPermissions: string[],
  ): Promise<void>;
}
```

## Migration SQL (0020)

```sql
-- 0020_comment_images.sql
BEGIN;

CREATE TABLE IF NOT EXISTS comment_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id   uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  storage_key  varchar(500) NOT NULL,
  url          varchar(1000) NOT NULL,
  mime_type    varchar(100) NOT NULL,
  file_size    int NOT NULL CHECK (file_size > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comment_images_comment ON comment_images (comment_id);

-- Permission rows
INSERT INTO permissions (action, resource) VALUES
  ('CREATE', 'comment-images'),
  ('DELETE', 'comment-images')
ON CONFLICT DO NOTHING;

-- Grant to operator roles (can attach images to their comments)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('operador_organizacion', 'operador_sistema', 'admin_organizacion', 'admin_sistema')
  AND p.resource = 'comment-images'
ON CONFLICT DO NOTHING;

COMMIT;
```

## S3 Key Convention

```
comments/{commentId}/{uuid}-{sanitizedOriginalname}

Example: comments/a1b2-c3d4/.../3f9e-...-foto-incidente.jpg
```

`sanitizedOriginalname` = `originalname.replace(/[^a-zA-Z0-9._-]/g, '_')` to prevent path traversal.

## Service Pseudocode (key paths)

```typescript
// attachToComment
async attachToComment(commentId, callerId, permissions, files) {
  const comment = await this.commentsRepo.findOne({ where: { id: commentId } });
  if (!comment) throw new NotFoundException();

  const isOwner = comment.userId === callerId;
  const hasPermission = permissions.includes('CREATE comment-images');
  if (!isOwner && !hasPermission) throw new ForbiddenException();

  // Validate MIME types
  const ALLOWED = ['image/jpeg','image/png','image/gif','image/webp'];
  for (const file of files) {
    if (!ALLOWED.includes(file.mimetype)) throw new UnprocessableEntityException(...);
  }

  const inserted: CommentImageEntity[] = [];
  for (const file of files) {
    const { key, url } = await this.storage.upload(commentId, file);
    const entity = this.imageRepo.create({ commentId, storageKey: key, url, mimeType: file.mimetype, fileSize: file.size });
    inserted.push(await this.imageRepo.save(entity));
  }
  return inserted.map(toDto);
}

// removeFromComment
async removeFromComment(commentId, imageId, callerId, permissions) {
  const image = await this.imageRepo.findOne({ where: { id: imageId } });
  if (!image || image.commentId !== commentId) throw new NotFoundException();

  const comment = await this.commentsRepo.findOne({ where: { id: commentId } });
  const isOwner = comment?.userId === callerId;
  const hasPermission = permissions.includes('DELETE comment-images');
  if (!isOwner && !hasPermission) throw new ForbiddenException();

  try {
    await this.storage.delete(image.storageKey);
  } catch (err) {
    this.logger.warn('S3 delete failed', { key: image.storageKey, error: err.message });
  }

  await this.imageRepo.delete({ id: imageId });
}
```

## Deviations from Legacy

| Legacy behavior | NestJS design | Reason |
|---|---|---|
| GeoReporta uses polymorphic `images` table (imageable_type, imageable_id) | Dedicated `comment_images` table | Simpler schema for a single use case; NestJS has no existing polymorphic images table to reuse |
| GeoReporta `ImageStorageService.attachMany()` handles multiple files in one call | NestJS loops `storage.upload()` per file | Avoids a complex shared service; each upload is independent and failure-isolated |
| `CommentImageResource` wraps GeoReporta's Image model | `CommentImageDto` plain class | NestJS uses plain DTOs, not resource transformers |
