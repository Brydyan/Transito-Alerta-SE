# Verification Report: T5.5 Comment Images

**Change**: t5.5-comment-images
**Version**: spec.md (R1, R2 — 13 scenarios)
**Mode**: Strict TDD
**Date**: 2026-08-23

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 22 (Phases 1–9) |
| Tasks complete | 22 |
| Tasks incomplete | 0 |

All 9 phases checked off in tasks.md. apply-progress confirms status: COMPLETE.

---

## Build & Tests Execution

**Unit tests**: 774/774 passed (87 suites) — exit code 0
```
Test Suites: 87 passed, 87 total
Tests:       774 passed, 774 total
Time:        12.29 s
```

**E2E tests**: 196/196 passed (21 suites) — exit code 0
```
Test Suites: 21 passed, 21 total
Tests:       196 passed, 196 total
Time:        296.676 s
```

Note: `MailOutboxConsumer` ECONNREFUSED errors in e2e output are pre-existing infrastructure noise (mail server not running in test env) and do not affect test results.

**Build**: Not run in this pass (unit + e2e pass implies compile success; previous apply phase ran `npm run build` cleanly per apply-progress).

**Coverage**: Not available (not configured).

---

## Spec Compliance Matrix

### POST /api/comments/:id/images

| Scenario | Test | Layer | Result |
|----------|------|-------|--------|
| Scenario 1: Owner attaches a single image → 201, 1 item, 1 DB row | `comment-images.e2e-spec.ts > POST 2 JPEG files by owner → 201...` | E2E | ⚠️ PARTIAL — test uses 2 files; single-file path not independently exercised |
| Scenario 2: Owner attaches multiple images → 201, N items, N rows | `comment-images.e2e-spec.ts > POST 2 JPEG files by owner → 201...` | E2E | ✅ COMPLIANT |
| Scenario 3: Non-owner without permission → 403 | `comment-images.e2e-spec.ts > non-owner without CREATE comment-images permission → 403` | E2E | ✅ COMPLIANT |
| Scenario 4: More than 5 files → 422 | `comment-images.e2e-spec.ts > POST 6 files → 400/422 (Multer count limit)` | E2E | ⚠️ PARTIAL — spec says 422; Multer returns 400; test accepts both |
| Scenario 5: Invalid MIME type → 422 | `comment-images.e2e-spec.ts > POST PDF file → 422` | E2E | ✅ COMPLIANT |
| Scenario 6: File over 5MB → 422 | (none) | — | ❌ UNTESTED |
| Scenario 7: Comment not found → 404 | `comment-images.service.spec.ts > comment not found: throws NotFoundException` | Unit | ⚠️ PARTIAL — service unit test proves NotFoundException; HTTP 404 response not exercised in E2E |

### DELETE /api/comments/:id/images/:imageId

| Scenario | Test | Layer | Result |
|----------|------|-------|--------|
| Scenario 1: Owner deletes image → 204, DB row gone | `comment-images.e2e-spec.ts > DELETE image by owner → 204, DB row gone` | E2E | ✅ COMPLIANT |
| Scenario 2: S3 failure → 204, DB row still removed, warning logged | `comment-images.service.spec.ts > S3 delete failure: still calls imageRepo.delete, logs warning (no throw)` | Unit | ⚠️ PARTIAL — verified at service unit level; E2E cannot mock S3 |
| Scenario 3: Image belongs to different comment → 404 | `comment-images.e2e-spec.ts > DELETE with wrong comment ID → 404` | E2E | ✅ COMPLIANT |
| Scenario 4: Non-owner without permission → 403, image preserved | `comment-images.e2e-spec.ts > DELETE by non-owner without DELETE comment-images permission → 403` | E2E | ✅ COMPLIANT |
| Scenario 5: Unauthenticated → 401 | `comment-images.e2e-spec.ts > POST unauthenticated → 401` | E2E | ⚠️ PARTIAL — guard verified for POST; no explicit test for DELETE unauthenticated |

**Compliance summary**: 6/13 fully COMPLIANT, 5/13 PARTIAL, 1/13 UNTESTED, 0/13 FAILING.

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| R1: POST endpoint with JwtAuthGuard | ✅ Implemented | `@UseGuards(JwtAuthGuard)` at class level |
| R1: Owner OR `CREATE comment-images` permission check | ✅ Implemented | `comment.userId === callerId \|\| callerPermissions.includes('CREATE comment-images')` |
| R1: Max 5 files (Multer `FilesInterceptor('images', 5)`) | ✅ Implemented | Controller line 27 |
| R1: Max 5MB per file (Multer `limits.fileSize`) | ✅ Implemented | Controller line 27 |
| R1: MIME allowlist validation (jpeg/png/gif/webp) | ✅ Implemented | `ALLOWED_MIME_TYPES` constant in service |
| R1: 201 response with array of image objects | ✅ Implemented | Service returns `CommentImageDto[]`; POST method default is 201 |
| R1: Response fields id, url, mimeType, fileSize, createdAt | ⚠️ Partial | Spec specifies snake_case `mime_type`, `file_size`, `created_at` but DTO uses camelCase. NestJS serializes as-is (camelCase). |
| R2: DELETE endpoint with JwtAuthGuard | ✅ Implemented | Same class-level guard |
| R2: Owner OR `DELETE comment-images` permission check | ✅ Implemented | Service `removeFromComment` |
| R2: image.commentId mismatch → 404 (not 403) | ✅ Implemented | Checked before ownership in service |
| R2: DB row removed on success | ✅ Implemented | `imageRepo.delete({ id: imageId })` |
| R2: S3 graceful degradation (warn + remove DB) | ✅ Implemented | try/catch with `this.logger.warn(...)` |
| R2: 204 No Content | ✅ Implemented | `@HttpCode(HttpStatus.NO_CONTENT)` on DELETE handler |
| Migration: comment_images table with all columns | ✅ Implemented | 0024_comment_images.sql |
| Migration: ON DELETE CASCADE | ✅ Implemented | `REFERENCES comments(id) ON DELETE CASCADE` |
| Migration: idx_comment_images_comment index | ✅ Implemented | `CREATE INDEX IF NOT EXISTS idx_comment_images_comment` |
| Migration: CREATE/DELETE comment-images permissions | ✅ Implemented | `INSERT INTO permissions` in 0024 |
| Migration: Permissions granted to 4 roles | ✅ Implemented | JSONB UPDATE on `roles.permissions` |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1: CommentImageStorageService as separate class (not generalized) | ✅ Yes | Standalone `@Injectable()` service in its own file |
| D2: Upload first, then INSERT (no orphan rows on S3 failure) | ✅ Yes | `storage.upload()` before `imageRepo.save()` in service loop |
| D3: S3 failure: warn + delete DB row regardless | ✅ Yes | try/catch with warn + unconditional `imageRepo.delete()` |
| D4: ON DELETE CASCADE on comment_images.comment_id | ✅ Yes | Verified in migration SQL |
| D5: Ownership check: owner OR permission | ✅ Yes | Both `attachToComment` and `removeFromComment` |
| D6: FilesInterceptor('images', 5) with fileSize 5MB | ✅ Yes | Controller line 27 |
| Migration slot 0020 → 0024 (slots 0020-0023 taken by T5.6) | ✅ Documented | Deviation acknowledged in apply-progress; tasks.md said 0020 |
| role_permissions join table → JSONB roles.permissions UPDATE | ✅ Adapted | design.md referenced join table; project uses JSONB pattern (same as 0019) |

---

## Issues Found

### CRITICAL (must fix before archive)

None.

### WARNING (should fix)

**W1 — Spec R1 Scenario 4: 6-file limit returns 400, not 422**
The spec explicitly states "More than 5 files MUST return 422." NestJS/Multer maps the `LIMIT_UNEXPECTED_FILE` error to a 400 Bad Request, not 422. The e2e test pragmatically accepts `[400, 422]`, but the API contract as written says 422. This can be addressed with a custom Multer exception filter that converts the 400 to 422, or the spec can be revised to accept 400.

**W2 — Response field naming: camelCase vs spec's snake_case**
`spec.md` R1 specifies the response shape as `{id, url, mime_type, file_size, created_at}` in snake_case. The `CommentImageDto` uses camelCase (`mimeType`, `fileSize`, `createdAt`) and NestJS serializes DTOs as-is. The actual HTTP response sends `{"mimeType": ..., "fileSize": ..., "createdAt": ...}`, not `{"mime_type": ..., "file_size": ..., "created_at": ...}`. The e2e tests do not verify field names, only array length and `id`. If external consumers expect snake_case, a ClassSerializerInterceptor + `@Transform` strategy is needed. If the project convention is camelCase, the spec should be updated.

**W3 — E2E coverage gap: POST Scenario 7 (comment not found → 404)**
The spec requires `POST /api/comments/:nonexistent/images` to return 404. This is unit-tested at the service level (NotFoundException thrown) but not exercised in e2e as an HTTP 404 response. A one-line e2e test would close this gap.

### SUGGESTION (nice to have)

**S1 — E2E coverage: POST Scenario 6 (file over 5MB → 422)**
Multer's `LIMIT_FILE_SIZE` error path is not exercised in e2e. Unit test at controller/interceptor level would also be acceptable. Currently zero test coverage for the size limit path.

**S2 — E2E coverage: DELETE Scenario 5 (unauthenticated → 401)**
The JwtAuthGuard is verified for POST unauthenticated. A matching test for DELETE unauthenticated is missing. Because the guard is class-level, this passes by structural reasoning, but the scenario is unproven in e2e.

**S3 — E2E coverage: non-owner WITH permission succeeds (CREATE and DELETE)**
The unit tests cover "staff with permission" happy paths, but E2E doesn't provision a user with `CREATE comment-images` or `DELETE comment-images` permissions explicitly to confirm the permission-based staff override works end-to-end.

---

## Verdict

**PASS WITH WARNINGS**

All 774 unit tests and 196 e2e tests pass. The core behavioral contract (upload, MIME validation, ownership/permission gates, 204 delete, graceful S3 degradation) is implemented correctly and verified. Two warnings require attention before or during archive: the Multer 400/422 discrepancy (W1) and the camelCase vs snake_case response contract (W2). These should be resolved by updating either the implementation or the spec to reflect the agreed-upon convention. No CRITICAL issues block archive.
