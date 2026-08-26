# Proposal: T5.5 Comment Images — Upload / Delete Adjuntos en Comentarios

Port reference:
- `GeoReporta/backend/app/Domains/Comments/Http/CommentImageController.php`
- Pattern reuse: `backend/src/modules/users/avatar-storage.service.ts` (existing S3 abstraction)

Next free migration: **0020** (0019 taken by T5.1 incident-claim).

## Intent

GeoReporta allows operators to attach images to comments. The NestJS backend has `CommentEntity`
and `CommentsModule` but no image attachment capability. The existing `AvatarStorageService`
already defines the S3 abstraction pattern — comment images should reuse and generalize it rather
than introducing a second storage implementation.

## Scope

### In Scope

- Migration `0020_comment_images.sql` — creates `comment_images` table:
  `(id uuid PK, comment_id uuid FK → comments.id ON DELETE CASCADE, storage_key varchar,
  url varchar, mime_type varchar, file_size int, created_at timestamptz)`.
  Index on `comment_id`. Permission rows: `CREATE comment-images`, `DELETE comment-images`.
  `+ .DOWN.sql`.
- `CommentImageEntity` — TypeORM entity mapping `comment_images`.
- `CommentImageStorageService` — generalises `AvatarStorageService` pattern:
  `upload(commentId, file): Promise<{key, url}>`. Key convention:
  `comments/{commentId}/{uuid}-{originalname}`. Keeps upload/delete as the seam for the real
  S3 client.
- `CommentImagesService` — `attachToComment(commentId, userId, files[])`,
  `removeFromComment(commentId, imageId, userId)`.
  - `attachToComment`: validates comment exists and caller owns it (or is admin), uploads each
    file via `CommentImageStorageService`, inserts rows into `comment_images`. Returns image array.
  - `removeFromComment`: validates image belongs to comment (404 otherwise), validates caller
    owns the comment (403 otherwise), calls `CommentImageStorageService.delete(key)` — on S3
    failure: log warning but still delete the DB row (mirrors GeoReporta's graceful degradation).
- `CommentImagesController`:
  - `POST /api/comments/:id/images` — multipart, `@UseInterceptors(FilesInterceptor('images'))`
  - `DELETE /api/comments/:id/images/:imageId`
- Both endpoints: `JwtAuthGuard` + ownership check (caller must own the comment, or have
  `@RequirePermissions('CREATE comment-images')` / `@RequirePermissions('DELETE comment-images')`).
- DTOs: `AttachImagesResponseDto`, `CommentImageDto`.
- Unit tests: `CommentImagesService` (attach, remove, ownership guard, S3 failure graceful degradation).
- E2e tests: attach 2 images → confirm DB rows, delete one → confirm row removed, non-owner 403.

### Out of Scope

- Image resizing / thumbnail generation (no `sharp` in current stack).
- Image validation beyond MIME type whitelist (jpeg, png, gif, webp).
- Real S3 SDK integration (the storage service is a seam; the real SDK is wired at deploy time).
- Multi-image delete in one request (each image is deleted individually).

## Capabilities

### New Capabilities
- `comment-images`: attach + remove image attachments on comments.

### Modified Capabilities
- `comments` module: gains `CommentImagesController` and `CommentImagesService`.
- `AvatarStorageService` is NOT modified — `CommentImageStorageService` is a sibling following
  the same pattern.

## Approach

`CommentImageStorageService` is a near-copy of `AvatarStorageService` with a different key prefix
and a `delete(key)` method the avatar service doesn't need. Introducing a shared
`AbstractStorageService` base class was considered but rejected — two concrete implementations
sharing an interface are cheaper to test and avoid premature abstraction (D1).

Ownership check: the service calls `CommentsRepository.findById(commentId)` and checks
`comment.userId === caller.id || caller.hasPermission('CREATE comment-images')`. This mirrors
GeoReporta's `Gate::authorize('update', $comment)` pattern translated to NestJS idioms.

`ON DELETE CASCADE` on `comment_images.comment_id` means deleting a comment removes its images
from the DB automatically; the S3 objects become orphans in that path (acceptable — same GeoReporta
behavior; a cleanup job is out of scope for T5.5).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `database/migrations/0020_comment_images.sql` | New | `comment_images` table + permission rows |
| `backend/src/entities/comment-image.entity.ts` | New | TypeORM entity |
| `backend/src/modules/comments/comment-image-storage.service.ts` | New | S3 abstraction for images |
| `backend/src/modules/comments/comment-images.service.ts` | New | attach/remove logic |
| `backend/src/modules/comments/comment-images.controller.ts` | New | 2 HTTP endpoints |
| `backend/src/modules/comments/comments.module.ts` | Modified | Register new providers + controller |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| S3 upload failure leaves no DB row | Low | Upload first, then INSERT — on upload failure, throw before inserting (no orphan DB row) |
| S3 delete failure silently orphans S3 object | Med (by design) | Log warning + delete DB row (mirrors GeoReporta's explicit behavior). Add `X-Storage-Warning` header in response on graceful degradation |
| Large multi-file upload OOM | Low | `FilesInterceptor` limits: max 5 files, 5MB each (via `MulterOptions`) |

## Rollback Plan

1. Remove `CommentImagesController`, `CommentImagesService`, `CommentImageStorageService` from `CommentsModule`.
2. Apply `database/rollback/0020_comment_images.DOWN.sql` — drops `comment_images` table and permission rows.
3. `comment_images.comment_id` cascade: no orphan rows; S3 keys still exist but cost is negligible.

## Dependencies

- T2.2 Comments module (`CommentEntity`, `CommentsService`).
- T3.6 Invitations (permission infrastructure).
- `AvatarStorageService` (pattern reference, not runtime dependency).

## Success Criteria

- [ ] `POST /api/comments/:id/images` with valid multipart files returns 201 with image array including `id`, `url`, `mime_type`.
- [ ] DB rows appear in `comment_images` for the uploaded images.
- [ ] Non-owner of comment gets 403.
- [ ] `DELETE /api/comments/:id/images/:imageId` returns 204 and removes the DB row.
- [ ] Deleting an image belonging to a different comment returns 404.
- [ ] S3 delete failure still removes the DB row and logs a warning.
- [ ] `npm test && npm run test:e2e` green.
