# Spec: Comments — Image Upload Support (Delta)

## Domain: comments (MODIFIED delta)

### Requirement: R5 — Comment Images (Real Implementation)
The system MUST support uploading 1-5 compressed images per comment via a working multi-file endpoint, backed by real object storage (Phase A) and client-side compression (Phase B). Comment composer / incident-detail UI wiring is deferred to a future feature; this requirement covers the service-layer contract only.

(Previously: R5.1/R5.2 described stubs only — commented-out empty FormData never sent, compression service with no integration, deferred to "Priority 2")

- Scenario: Compress then upload (service-level) — commentService.uploadCommentImage(commentId, files) with 1-5 files -> each compressed (WebP <=200KB) -> FormData with one 'images' entry per file -> POST /comments/:id/images -> Observable<CommentImage[]> emits stored images (file_size, mime_type, no comment_id)
- Scenario: Real storage backs the upload — Phase A storage provisioned -> images persisted in real bucket, no SHA-256 placeholder
- Scenario: UI wiring deferred — no comment composer currently invokes uploadCommentImage() -> service contract ready for future composer -> no UI component added/modified by this change

## Coverage
Happy paths: covered (upload, compression, multi-file, mapping). Edge cases: covered (already-small image, >5 files, delete verification). Error states: partial — 413/415/422 handling referenced in proposal's test list but not spec'd as scenarios here (implementation detail, belongs in tasks/design).

## Assumption Flagged
R7 (user-provided requirement: "Upload on Comment Composer") conflicts with proposal Scope OUT (comment composer / incident-detail UI... does not exist... upload stays unwired). Resolved by scoping R5's real-implementation requirement to the service-layer contract only, with an explicit "UI wiring deferred" scenario, rather than adding UI requirements the proposal excludes.

## Next
Ready for sdd-tasks (depends on Phase A and Phase B).
