# Proposal: Comment Image Upload — Full Implementation (Stream 3)

## Intent

`CommentService.uploadCommentImage()` posts an **empty** `FormData` (`comment.service.ts:78-83`): the `append` is commented out and the only unit test asserts the URL, not the payload. Every upload silently succeeds with zero files. Underneath it, the backend never stored anything either — `CommentImageStorageService.upload()` returns a SHA-256 placeholder URL at `https://storage.example.com/...` and `delete()` is a no-op (`comment-image-storage.service.ts:25-38`). Shipping the frontend on top of that would persist rows pointing at URLs that 404.

Verified contract drift (backend is the source of truth):

| Concern | Backend (verified) | Frontend today |
|---|---|---|
| Field name | `FilesInterceptor('images', 5, 5MB)` — `comment-images.controller.ts:27` | `'image'` (commented out) |
| Cardinality | `Promise<CommentImageDto[]>` — up to 5 | `Observable<CommentImage>` (single) |
| Wire shape (after global `SnakeCaseResponseInterceptor`) | `{ id, url, mime_type, file_size, created_at }` | `{ id, comment_id, url, size_bytes, mime_type, created_at }` |

So the model is already snake_case — the defect is **field drift**: `size_bytes` ≠ `file_size`, and `comment_id` is never returned.

## Scope

### In Scope — Phase A (backend, prerequisite)
- Decide S3 vs Supabase Storage, provision bucket + credentials
- Replace the placeholder in `CommentImageStorageService` (upload, signed URL, real `delete`)
- Fix `AvatarStorageService` — identical placeholder, same seam, same commit
- Create `backend/.env.example` (does not exist today) with storage vars

### In Scope — Phase B (frontend)
- Add `browser-image-compression`; regenerate `frontend/pnpm-lock.yaml` (CI uses `--frozen-lockfile`)
- `ImageCompressorService`: WebP, ≤200 KB, pass-through on unsupported input
- `uploadCommentImage(commentId, files: File[])` → `append('images', f)` per file, returns `Observable<CommentImage[]>`
- Align `CommentImage`: `file_size` (not `size_bytes`), drop `comment_id`
- Unit tests: compression, multi-file FormData, 413/415/422 error paths

### Out of Scope
- Comment composer / incident-detail UI — does not exist in `frontend/src/app/features/`; upload stays unwired
- Admin "delete image" UI (API exists, read-only for now)
- Chunked/resumable upload, EXIF stripping, virus scanning
- Migrating existing `comment_images` rows off placeholder URLs

## Capabilities

### New Capabilities
- `object-storage`: real bucket-backed upload/signed-URL/delete contract shared by comment images and avatars
- `frontend-image-upload`: client-side compression + multi-file upload contract

### Modified Capabilities
- `comments`: image-upload requirements move from "stub, no implementation yet" (spec.md L137-150, L241) to a real multi-file contract; response shape corrected to `file_size`

## Approach

Two gated phases. **A** swaps the storage implementation behind the existing `upload/getSignedUrl/delete` seam — both services already isolate it and every consumer test mocks the service, so no call-site churn. **B** compresses in the browser before upload (payload shrinks ~10x under the 5 MB/file cap), then builds `FormData` from an array. Frontend contract is derived from the controller, not the DTO class: the DTO is camelCase but the global interceptor rewrites the wire, and only the wire shape is binding.

B must not merge before A: green frontend tests against placeholder storage would certify a broken feature.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/modules/comments/comment-image-storage.service.ts` | Modified | Real client |
| `backend/src/modules/users/avatar-storage.service.ts` | Modified | Same fix |
| `backend/.env.example` | New | Storage vars |
| `frontend/src/app/core/services/comment.service.ts` | Modified | Real FormData, array return |
| `frontend/src/app/core/models/comment.model.ts` | Modified | `file_size` |
| `frontend/src/app/core/services/image-compressor.service.ts` | New | Compression |
| `frontend/package.json`, `pnpm-lock.yaml` | Modified | New dep |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| S3-vs-Supabase decision unmade — blocks Phase A | High | Force the call at proposal approval; the seam makes the choice reversible |
| Credentials leak into CI logs / repo | Med | Secrets only; `.env.example` carries names, never values |
| Compression drops below 200 KB by wrecking quality | Med | Cap `maxWidthOrHeight`, floor quality, assert output MIME in tests |
| Existing rows keep placeholder URLs after cutover | Med | Accept; document as known limitation |
| Signature/type change breaks callers | Low | Only caller is `comment.service.spec.ts:116` |

## Rollback Plan

Phases revert independently. **B**: revert the frontend commit — the stub returns and no rows are written. **A**: restore the placeholder service; already-uploaded objects are orphaned in the bucket (delete by `comments/` and `avatars/` key prefix). No schema change, so `comment_images` needs no migration either way.

## Dependencies

- **BLOCKING**: storage provider decision + provisioned bucket/credentials (Phase A gates Phase B)
- `browser-image-compression` (new frontend dependency)
- Comment UI feature — gates end-user visibility only, not this change

## Success Criteria

- [ ] Uploaded object is retrievable from the real bucket via the returned URL; `delete()` removes it
- [ ] `uploadCommentImage` sends `FormData` with one `images` entry per file, ≤5 files
- [ ] Compressed output is `image/webp` and ≤200 KB for a ≥2 MB JPEG fixture
- [ ] `CommentImage` matches the wire (`file_size`, no `comment_id`); no field-drift left
- [ ] New/changed frontend units ≥70% coverage; backend suite + `test:e2e` green
- [ ] `backend/.env.example` documents every required storage var
