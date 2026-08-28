# Tasks: Comment Image Upload — Full Implementation

Gate: Phase B MUST NOT start until Phase A is merged and D1 resolved.
Spec refs: object-storage (Phase A), frontend-image-upload (Phase B), comments R5 (both).

## Phase A: Backend Storage (BLOCKING — requires D1: S3 vs Supabase)
- A0.1 Confirm D1 team decision (S3 or Supabase) before starting A1
- A1 Provisioning — pick ONE branch: A1.1/A1.2 [S3] bucket+IAM+.env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET) OR A1.1b/A1.2b [Supabase] enable Storage+bucket+quota+.env vars (SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET)
- A2.1 Add @aws-sdk/client-s3 or reuse Supabase client dep; pnpm install (backend/)
- A3.1 Create backend/.env.example documenting D1-selected var names (Req: Credentials Documented)
- A4 CommentImageStorageService (Req: Real Storage Provisioned) — TDD: A4.1 RED (spec mocks real SDK, asserts no SHA-256 placeholder), A4.2 GREEN (comment-image-storage.service.ts: inject real client via DI+ConfigService, implement upload/getSignedUrl/delete), A4.3 REFACTOR
- A5.1 AvatarStorageService (D2) real-client wiring — noted as separate follow-up, out of scope
- A6 Backend E2E (Req: Real Upload Verified End-to-End): A6.1 POST /comments/:id/images real file <=5MB stores+resolves signed URL, A6.2 delete() verified absent

## Phase B: Frontend Implementation (after Phase A merged)
- B1.1 pnpm add browser-image-compression (frontend/); regenerate lockfile
- B2 ImageCompressorService (Req: Image Compression Before Upload) — TDD: B2.1 RED (webp <=200KB on >=2MB JPEG fixture, small-input passthrough), B2.2 GREEN (new frontend/src/app/core/services/image-compressor.service.ts, compress(file,quality=0.7):Promise<Blob>, maxSizeMB 0.2)
- B3 CommentService.uploadCommentImage (Req: Multi-File FormData Contract) — TDD: B3.1 RED (comment.service.spec.ts ~116-122: one 'images' entry per file, File[] input, Observable<CommentImage[]> output), B3.2 GREEN (comment.service.ts ~78-83: Promise.all compress, one FormData, POST /comments/:id/images)
- B4 Type Alignment (Req: Wire-Aligned Response Mapping): B4.1 comment.model.ts -> {id,url,file_size,mime_type,created_at}, remove comment_id; B4.2 mapping test
- B5.1 70%+ coverage on comment.service.ts and image-compressor.service.ts
- B6 E2E (service-level, UI deferred): B6.1 extend/create frontend e2e — real image -> compressed -> returned; B6.2 comment composer UI wiring explicitly deferred, no UI task in this change

## Breakdown
| Phase | Tasks | Focus |
|-------|-------|-------|
| Phase A | 6 groups (A0-A6), ~13 checklist items incl. branch options | Backend real object storage, blocked on D1 |
| Phase B | 6 groups (B1-B6), ~9 checklist items | Frontend compression + multi-file wiring, service-level only |

## Implementation Order
A0 (decision gate) -> A1 (provisioning, branch per D1) -> A2 (deps) -> A3 (.env.example) -> A4 (TDD storage service) -> A6 (e2e) -> merge Phase A -> B1 (deps) -> B2 (TDD compressor) -> B3 (TDD upload service) -> B4 (type alignment) -> B5 (coverage) -> B6 (e2e, UI deferred). A5 (avatar) is a parallel/independent follow-up, not blocking.

## Next Step
Ready for implementation (sdd-apply), pending D1 resolution before Phase A tasks begin.
