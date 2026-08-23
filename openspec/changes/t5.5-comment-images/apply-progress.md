# Apply Progress: T5.5 Comment Images

**Status**: COMPLETE  
**Date**: 2026-08-23  
**Mode**: Strict TDD  

## Summary

All 9 phases complete. 774 unit tests + 196 e2e tests passing.

## Migration Deviation

Tasks.md designated migration slot **0020** but that slot was taken by T5.6 migrations (0020-0023 already applied). Used **0024** instead.
Also: tasks.md references a `role_permissions` join table that does not exist — project uses JSONB `roles.permissions` array (same as 0019 pattern). Adapted accordingly.

## Files Created

- `database/migrations/0024_comment_images.sql`
- `database/rollback/0024_comment_images.DOWN.sql`
- `backend/src/entities/comment-image.entity.ts`
- `backend/src/modules/comments/comment-image-storage.service.ts` + interface `MulterFile`
- `backend/src/modules/comments/comment-image-storage.service.spec.ts` (4 unit tests)
- `backend/src/modules/comments/comment-images.service.ts`
- `backend/src/modules/comments/comment-images.service.spec.ts` (10 unit tests)
- `backend/src/modules/comments/comment-images.controller.ts`
- `backend/src/modules/comments/dto/comment-image.dto.ts`
- `backend/test/e2e/comment-images.e2e-spec.ts` (8 e2e tests)

## Files Modified

- `backend/src/modules/comments/comments.module.ts` — added CommentImagesController, CommentImagesService, CommentImageStorageService, CommentImageEntity
- `database/MIGRATION_LOG.md` — added 0024 row

## Key Decisions / Gotchas

- `@types/multer` not in package.json — defined local `MulterFile` interface in storage service; use it throughout (services + specs). Controller passes it via `@UploadedFiles()` directly.
- Migration slot 0020 taken → 0024
- No `role_permissions` table → JSONB UPDATE on `roles.permissions` (same pattern as 0019)
- Multer count limit (6 files > 5) returns 400 from NestJS — test accepts `[400, 422]`
- 6-file test: `req.attach(...)` in a loop before `await req` for proper chaining
- MIME check is service-side (UnprocessableEntityException = 422), not Multer-side
- DELETE: S3 failure logs warning but still removes DB row (design D3)
- comment_images cascade-deleted when comment is deleted (ON DELETE CASCADE)

## Test Results

- Unit: 774/774 pass (87 suites)  
- E2E: 196/196 pass (21 suites)
