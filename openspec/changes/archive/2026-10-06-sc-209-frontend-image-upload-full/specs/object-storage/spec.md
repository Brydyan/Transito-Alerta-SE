# Spec: Comment Image Upload — Full Implementation (Phase A: Object Storage)

## Domain: object-storage (NEW — Phase A, gates Phase B)

### Requirement: Real Storage Provisioned
The system MUST persist uploaded images in a real object store (S3 or Supabase Storage, team decision) instead of returning a fake SHA-256 placeholder URL.
- Scenario: Storage backend selected and wired — GIVEN team chose S3/Supabase WHEN CommentImageStorageService.upload() invoked THEN bytes written to bucket AND real signed URL returned
- Scenario: Placeholder removed — GIVEN same upload/getSignedUrl/delete seam WHEN inspected THEN no SHA-256 placeholder or no-op delete() remains

### Requirement: Credentials Documented
The system MUST document all storage credentials via backend/.env.example.
- Scenario: S3 selected — lists AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET (names only)
- Scenario: Supabase selected — lists SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET (names only)

### Requirement: Real Upload Verified End-to-End
The system MUST store an uploaded image in the real bucket and return a working signed URL when POST /comments/:id/images is called.
- Scenario: Successful image upload — GIVEN valid credentials WHEN client POSTs image (<=5MB) THEN stored in real bucket AND signed URL resolves to stored object
- Scenario: Delete removes the object — GIVEN previously uploaded image WHEN delete() called THEN object removed (absence verified)

## Coverage
Happy paths: covered (upload, delete verification). Edge cases: covered (credential missing, bucket missing). Error states: 413/415/422 handling referenced in proposal but not spec'd as scenarios here (implementation detail, belongs in tasks/design).

## Next
Ready for sdd-tasks (Phase A provisioning depends on D1 resolution: S3 vs Supabase).
