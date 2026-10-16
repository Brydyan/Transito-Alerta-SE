# Spec: Comment Image Upload — Full Implementation (Phase B: Frontend)

## Domain: frontend-image-upload (NEW — Phase B, depends on Phase A)

### Requirement: Image Compression Before Upload
The system MUST compress a selected image to WebP, capped at 200KB, using browser-image-compression.
- Scenario: Large JPEG compressed — GIVEN JPEG up to 5MB WHEN processed by ImageCompressorService THEN output is image/webp <=200KB
- Scenario: Already-small image passes through — output remains valid, compression MAY be skipped

### Requirement: Multi-File FormData Contract
uploadCommentImage() MUST build FormData with field name 'images' (matches backend FilesInterceptor('images', 5, 5MB)), supporting multiple files per request.
- Scenario: Single file upload — 1-element array -> one 'images' entry -> POST /comments/:id/images
- Scenario: Multiple files upload — 2-5 files -> one 'images' entry per file; >5 rejected client-side or surfaces backend 422

### Requirement: Wire-Aligned Response Mapping
CommentImage model MUST match backend post-interceptor wire shape (file_size, mime_type, no comment_id) — no camelCase/field-name drift.
- Scenario: Response mapped correctly — backend returns { id, url, mime_type, file_size, created_at } -> mapped fields match exactly (file_size not size_bytes), no comment_id expected

## Coverage
Happy paths: covered (upload, compression, multi-file, mapping). Edge cases: covered (already-small image, >5 files). Error states: partial — 413/415/422 handling referenced in proposal but not spec'd as scenarios here (implementation detail, belongs in tasks/design).

## Next
Ready for sdd-tasks (Phase B depends on Phase A merged).
