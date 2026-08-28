# Design: Comment Image Upload — Full Implementation

## Technical Approach
Two gated phases swap a fake storage placeholder for a real bucket (Phase A) and wire the frontend to the real multi-file contract (Phase B). Both reuse existing seams — CommentImageStorageService.upload/getSignedUrl/delete and CommentService.uploadCommentImage() — no controller/DTO/entity changes needed. Phase B MUST NOT merge before Phase A.

## Architecture Decisions

**D1 — Storage Provider (BLOCKS Phase A)**: AWS S3 (mature, new @aws-sdk/client-s3 dep) vs Supabase Storage (reuse existing Supabase, confirm tier quota). UNRESOLVED — team decision required before Phase A tasks start. Reversible: both services only expose upload/getSignedUrl/delete, concrete client injected not leaked.

**D2 — CommentImageStorageService / AvatarStorageService real client**: inject real S3Client/Supabase StorageClient via constructor DI + ConfigService. Do NOT create a shared interface — rejected because the two services' contracts already differ (CommentImageStorageService.upload() returns {key,url} + has delete(); AvatarStorageService.upload() returns string only, no delete()). Only the placeholder lines change (comment-image-storage.service.ts:37 no-op delete, avatar-storage.service.ts getSignedUrl SHA-256).

**D3 — ImageCompressorService**: new frontend/src/app/core/services/image-compressor.service.ts using browser-image-compression. compress(file: File, quality=0.7): Promise<Blob> -> WebP, maxSizeMB 0.2 (200KB cap), maxWidthOrHeight bounded. Already-small inputs may pass through.

**D4 — CommentService.uploadCommentImage() — MULTI-FILE (correction to informal single-file draft)**: uploadCommentImage(commentId: string, files: File[]): Observable<CommentImage[]>. Compress each file (Promise.all), build ONE FormData with formData.append('images', blob, file.name) per file (repeated field, matches backend FilesInterceptor('images', 5, 5MB) -> Promise<CommentImageDto[]>). REJECTED alternative: singular Observable<CommentImage> wrapper — would reintroduce the exact cardinality drift the proposal flagged. This is a binding wire-contract fact verified against comment-images.controller.ts:27, not a style choice.

**D5 — CommentImage type alignment**: frontend/src/app/core/models/comment.model.ts changes to { id, url, file_size (was size_bytes), mime_type, created_at } — comment_id REMOVED (CommentImageDto/comment-images.service.ts:61-67 never returns it). Matches SnakeCaseResponseInterceptor output over CommentImageDto { id, url, mimeType, fileSize, createdAt }.

## Data Flow
File[] -> ImageCompressorService.compress() per file -> Blob(image/webp,<=200KB) -> Promise.all -> CommentService.uploadCommentImage builds FormData (append('images', blob) x N) -> POST /comments/:id/images -> CommentImagesController.attachImages (FilesInterceptor('images',5,5MB)) -> CommentImagesService.attachToComment -> storage.upload() per file (Phase A real bucket) -> imageRepo.save -> CommentImageDto[] -> SnakeCaseResponseInterceptor -> Observable<CommentImage[]> { id, url, mime_type, file_size, created_at }.

## File Changes
| File | Action | Description |
|------|--------|-------------|
| backend/src/modules/comments/comment-image-storage.service.ts | Modify (D1/D2) | Real S3/Supabase client, remove SHA-256 placeholder |
| backend/src/modules/users/avatar-storage.service.ts | Modify (D2) | Real S3/Supabase client injection |
| backend/.env.example | New (D1-dependent) | Document var names per storage choice |
| frontend/src/app/core/services/image-compressor.service.ts | New (D3) | compress(file,quality=0.7):Promise<Blob> |
| frontend/src/app/core/services/comment.service.ts | Modify (D4, ~78-83) | Multi-file uploadCommentImage(commentId,files[]) |
| frontend/src/app/core/models/comment.model.ts | Modify (D5) | { id, url, file_size, mime_type, created_at }, remove comment_id |
| frontend/package.json | Modify | Add browser-image-compression |
| pnpm-lock.yaml | Modify | Regenerate for --frozen-lockfile CI |
| frontend/src/app/core/services/comment.service.spec.ts | Modify (~116-122) | Rewritten for File[]/array/file_size |

## Testing Strategy
Unit backend: mock S3/Supabase SDK client, assert upload/delete calls + returned key/url. Unit frontend: ImageCompressorService output <=200KB image/webp on >=2MB JPEG fixture; uploadCommentImage FormData field 'images' x N (HttpTestingController); CommentImage mapping (file_size present, comment_id absent). E2E backend: extend existing comment-images.e2e-spec.ts once D1 resolved.

## Migration / Rollout
No schema/migration required. Phases revert independently (Phase B -> stub, no rows written; Phase A revert -> placeholder service restored, real-bucket objects orphaned, cleanup by comments/avatars key prefix). No feature flag needed — endpoint already live but no-op; no UI currently calls it (deferred per spec).

## Open Questions
- D1 S3 vs Supabase Storage: BLOCKS all Phase A tasks, needs explicit team decision before sdd-tasks can sequence backend work.
- Supabase tier Storage quota sufficiency (only relevant if D1 -> Supabase).

## Next
Ready for sdd-tasks.
