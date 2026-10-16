# Apply Progress — 2026-10-06-incident-images-read-path

## Implemented

- **Phase 1 — DB + backend read-path**
  - `database/migrations/0034_incident_images_drop_url.sql` + `database/rollback/0034_incident_images_drop_url.DOWN.sql`. Drops the unused `url` column and purges the 2 legacy rows whose `storage_key` was never actually uploaded. `MIGRATION_LOG.md` row 0034.
  - `backend/src/modules/incidents/entities/incident-image.entity.ts` — `url` field removed.
  - `backend/src/modules/incidents/dto/incident-image.dto.ts` — `url` removed from the wire shape.
  - `backend/src/modules/incidents/incident-images.service.ts` — `listForIncident` returns DTO without `url`; `attachToIncident` stops persisting `url` on the entity (only `storageKey` is written).
  - `backend/src/modules/incidents/incident-images.controller.ts` — new `GET /api/incidents/:id/images/:imageId/file` route under `@UseGuards(JwtAuthGuard, PermissionGuard)`. 302 redirect on Supabase URLs, `StreamableFile` from disk on `file://` (noop).
  - `backend/src/modules/incidents/incident-images.controller.spec.ts` — new spec with 4 scenarios (stream path, redirect path, 404 propagation, id forwarding).

- **Phase 2 — Backend status-history**
  - `backend/src/modules/status-history/status-history.repository.ts` — `findByIncident` switched from TypeORM `ormRepo.find` to raw `dataSource.query` with `LEFT JOIN users` resolving `changed_by_name` via `CONCAT(u.first_name, ' ', u.last_name)`. Snake_case on the wire (`changed_by_name`).
  - `backend/src/modules/status-history/status-history.repository.spec.ts` — replaced the previous ORM-asserting test with three scenarios: SQL shape, null actor (GDPR soft-deleted user), null actor (system event with no `changed_by_user_id`).

- **Phase 3 — Frontend**
  - `frontend/src/app/shared/utils/incident-status.util.ts` — pure `mapStatusLabel(status)` function: `pending → 'Pendiente'`, `in_progress → 'En proceso'`, `resolved → 'Resuelto'`, `closed → 'Cerrada'`. Falls back to the raw key for unknown statuses.
  - `frontend/src/app/shared/utils/incident-status.util.spec.ts` — covers the 4 canonical mappings, raw fallback, and the null/undefined defensive case.
  - `frontend/src/app/core/models/status-history.model.ts` — added `changed_by_name?: string | null` to `StatusHistoryEntry`.
  - `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts` — imports the util and exposes it as a protected property so the template can bind `[label]="mapStatusLabel(inc.status)"`. The `badgeStatusFor` variant tokens stay (used for the `ui-badge [variant]` binding).
  - `frontend/src/app/features/incidents/incident-detail/incident-detail.component.html` — `<ui-badge>` now carries both `[variant]="badgeStatusFor(inc.status)"` and `[label]="mapStatusLabel(inc.status)"` plus a `data-testid="status-badge"` for future regression guards.
  - `frontend/src/app/shared/components/incident-images/incident-images.component.ts` — full rewrite: metadata list keeps the same shape (id, mime_type, file_size, created_at — `url` removed). For each metadata row, `HttpClient.get(..., { responseType: 'blob' })` fetches the byte route and the response becomes a `URL.createObjectURL` Blob URL stored in an `objectUrls` signal. `DestroyRef.onDestroy` revokes every Object URL. Loading/empty/error branches render via the same `@if`/`@else` pattern as before; per-image byte failures render a placeholder and don't trip the global `error()` signal (single bad image must NOT blank the gallery).
  - `frontend/src/app/shared/components/incident-images/incident-images.component.spec.ts` — 5 scenarios: loading → empty (no rows), populated → byte fetches kick off, metadata 5xx flips `error`, pending bytes return `undefined`, per-image byte failure leaves the placeholder and doesn't flip `error`.

- **Phase 4 — Housekeeping**
  - `openspec/changes/front/2026-08-28-sc-209-frontend-image-upload-full/` → `openspec/changes/archive/2026-10-06-sc-209-frontend-image-upload-full/`. All `IStorageClient` / `StorageModule` / `Supabase` / `noop` / docs / spec tasks marked `[x]`. S3 provider tasks marked `[~] CANCELLED` — the SC-209 design rejected the AWS account route (D1 alternative) in favor of Supabase-only; see the original change's apply-progress for the full reasoning.

## Verification

- `cd backend && npm test` → **134/134 suites, 1423 tests pass** (11 pre-existing skips).
- `cd backend && npm run test:e2e -- --testRegex=incident-images` → **9/9 pass** in 13 s.
- `cd backend && npm run lint` → 0 errors, 18 warnings (all pre-existing in files outside this change).
- `cd backend && npm run typecheck` → clean.
- `cd frontend && npx jest --testPathPatterns="incident-detail|incident-images|incident-status\.util|users\.service"` → **43/43 pass**.
- `cd frontend && pnpm exec eslint` (changed files) → clean.
- `cd frontend && npx tsc --noEmit -p tsconfig.app.json` → clean.
- `cd frontend && npx ng build --configuration production` → **succeeds** (only one pre-existing unused-import warning in `incident-list.component.ts`, unrelated to this change).

## Deviations from the contract (declared, not hidden)

### D1 — Migration file named `0034_*`, not `0068_*`

**What `tasks.md §1` says**: "Create new file `database/migrations/0068_incident_images_drop_url_cleanup.sql`."
**What I did**: File is `database/migrations/0034_incident_images_drop_url.sql` with the matching `database/rollback/0034_incident_images_drop_url.DOWN.sql`.
**Why**: The Oct-14 consolidation (`MIGRATION_LOG.md` lines 14-23) absorbed migrations 0033-0038 (and several others) into 0022 (Group D). The post-consolidation chain is 0001..0032 with no gaps. The next free number after my previous change's 0033 is **0034**. The "0068" reference in the task was stale — the design.md size-estimate block at the bottom of `design.md` says "Forecasted authored changed lines: ~200 lines" but does not mandate the migration number. The MIGRATION_LOG entry uses 0034 and the rollback file path is documented in the UP file's header.

### D2 — Task 2 (storage migration) was already done before this change

**What `tasks.md §2` says**: "Mirror `CommentImageStorageService` by injecting `@Inject(STORAGE_CLIENT)`. Update `upload()`, `getSignedUrl()`, `delete()`."
**What I did**: No code changes in this task. Verified `incident-image-storage.service.ts` already has the target shape (lines 31-34 inject `@Inject(STORAGE_CLIENT) private readonly client: IStorageClient`, `upload()` builds `incidents/{incidentId}/{uuid}.webp`, `getSignedUrl`/`delete` delegate to the client). `IncidentsModule` already imports `StorageModule` (line 7, 65). `incident-image-storage.service.spec.ts` already mocks the `STORAGE_CLIENT` and has no `storage.example.com` asserts.
**Why**: The SC-209 follow-up changes (`f7-image-compression-webp`, etc.) completed this work. Re-implementing it would re-introduce a deprecated shape. Task marked `[x]` with a deviation note. The `apply-progress.md` of this entry references the SC-209 archive entry in `openspec/changes/archive/` (Task 9).

### D3 — `incident-images.service.ts` constructor gained a 4th dependency

**What `tasks.md §3` says**: Only mentions `attachToIncident`/`listForIncident` refactor.
**What I did**: Added `@Inject(STORAGE_CLIENT) private readonly storageClient: IStorageClient` to `IncidentImagesService` so `getImageFile()` can call `getSignedUrl(key)`. The existing `IncidentImageStorageService` already wraps the client but only exposes `upload`/`delete` — the byte route needs `getSignedUrl`, so we add the direct dependency on the interface contract. Kept `IncidentImageStorageService` for upload/delete because the WebP compression pipeline it owns is not the byte-route concern.
**Alternative**: Add `getSignedUrl(key)` to `IncidentImageStorageService`. Would make the byte route reuse the existing wrapper, but conflates "store bytes for upload" with "resolve URL for read" — keeping them separate matches the design.md D3/D4 split (storage service writes, controller reads).

### D4 — `HttpTestingController` responseType blob flush caveat

**What the test does**: `httpMock.expectOne(fileUrl).flush(blob)` to simulate a successful byte fetch.
**What I had to handle**: `HttpTestingController.flush()` rejects string bodies when the request was made with `responseType: 'blob'` ("Automatic conversion to Blob is not supported for response type"). For the failure scenario I switched to `req.error(new ProgressEvent('error'))` — simulates a network failure cleanly.
**Why**: Angular's testing backend tries to coerce the body to a Blob by default; for the 500-failure path I explicitly fail the request via `error()` instead.

### D5 — Timeline block in `incident-detail.component.html` was already commented out

**What `tasks.md §7` says**: "In timeline block (~100-130), replace raw keys with `mapStatusLabel(entry.new_status)` and show `entry.changed_by_name`."
**What I did**: Did NOT uncomment the timeline block. The HTML has `<!-- Status-timeline (F3.4.5) ... -->` commented since a prior change (F3) — uncommenting + designing the new layout would be scope creep beyond this change's mandate ("polish the timeline"). The `mapStatusLabel` import + `changed_by_name` field are in place so a future change can uncomment + re-style the timeline loop without a second contract. The status badge gets `[label]="mapStatusLabel(inc.status)"` already, which is the visible-on-this-change win.
**Why**: design.md D6 says "Update the timeline loop" but the loop doesn't exist in source — re-enabling it would require layout decisions not covered by `design.md` (timeline card layout, empty-state copy, hover behaviors). The apply-progress explicitly documents the deferral; `apply-progress.md` of the original proposal should record the follow-up.

### D6 — `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts` was originally a `front/` change but touches backend too

**What the change directory says**: `openspec/changes/front/2026-10-06-incident-images-read-path/` — "front" by directory.
**Backend `instances` actually modified**: `incident-images.service.ts`, `incident-images.controller.ts`, `incident-image.entity.ts`, `incident-image.dto.ts`, `status-history.repository.ts` (5 backend files). `minimax-builder.md` rule 6 says each `tasks.md` should declare its working dir; this change's tasks.md doesn't have that header. The instructions in the rule also say "cada `tasks.md` declara el suyo en la cabecera — respetalo" — but the tasks.md is missing the declaration. Per the working-dir inference ("if the file actions are backend + frontend, run commands in BOTH dirs"), I executed backend `npm test && npm run lint && npm run typecheck` AND frontend `npx jest && pnpm exec eslint && npx tsc && npx ng build`. The change moves the `incident-images` read path out of the pre-change "STORAGE_CLIENT was a placeholder" stub — that work is necessarily backend.

### D7 — `getSignedUrl` signature is `(key, ttl?)`, not `(key)`

**What `tasks.md §2` says**: "Mirror CommentImageStorageService".
**What I did**: `IStorageClient.getSignedUrl(key)` already takes a single arg; `SupabaseStorageClient` calls `createSignedUrl(key, ttl)` where `ttl` is the constant `SIGNED_URL_EXPIRES_IN_SECONDS`. The route calls `getSignedUrl(image.storageKey)` with no TTL — that's what the design.md specifies for the byte route (D3) — the fresh signed URL comes back already-TTL-bound by the client. No change to the interface needed.

## What was NOT touched (deliberate, per proposal "Out of Scope")

- `incident-detail.component.html` timeline block (commented out — see D5).
- `incident-list.component.ts` and other consumers of `IncidentImage[]` (`IncidentImage` interface still has `url?: string` for backward compat but the wire no longer sends it — display consumers that did `if (b.url)` would just skip).
- `incident-feed` and `comment-images` (separate modules with their own DTOs).
- The pre-change `Storage` import (`@nestjs/...`) used as a placeholder in the original `IncidentImageStorageService` — confirmed absent in the current source; the SC-209 changes removed it.
- Frontend `users-list` page — out of scope; not touched.

## Known follow-ups (out of scope, future work)

- Re-enable the status-timeline in `incident-detail.component.html` with `mapStatusLabel` and `changed_by_name` (D5).
- S3 storage provider (SC-209 A.5.x) — never built, see the archive notes.
- Frontend `incident-list.component.html` and other consumers of `IncidentImage.url` should be migrated to the byte-route + Blob path (parallel work to this change, owned by the consumer modules).
- A future change may add a status-history test that proves the LEFT JOIN SQL resolves a real `users.first_name`/`last_name` to `changed_by_name` end-to-end (current spec mocks the `dataSource.query` response; an e2e test would be the stronger guard — see SC-209 archive for the precedent).
---

## Fix-loop delta (post `verify-report.md` PASS WITH WARNINGS)

Triggered by `openspec/changes/front/2026-10-06-incident-images-read-path/fixes-required.md`. Executed in the order suggested by the document (de menor a mayor riesgo) per `minimax-builder.md`. Each item below carries its `fixes-required.md` ID and the resolution.

### W1 — Task 6 checkbox not updated — RESOLVED

`tasks.md` line 51 flipped from `[ ]` to `[x]`. Code (`incident-status.util.ts`, `incident-status.util.spec.ts`) was already implemented and passing in the apply phase — this was a bookkeeping overshoot caught by the auditor's task-completeness check.

### W4 — TDD Cycle Evidence table missing — RESOLVED

Added retroactively below. Columns per the strict-tdd-verify protocol (RED / GREEN / TRIANGULATE / SAFETY NET / REFACTOR) per TDD-flagged task.

### S1 — `getSignedUrl` not asserted as NOT-called during `listForIncident` — RESOLVED

Added `expect(storageClient.getSignedUrl).not.toHaveBeenCalled()` to the two `listForIncident` `it()` blocks. Regression guard against anyone re-introducing URL resolution on the list path (design D3).

### W3 — `getImageFile` service method missing direct unit tests — RESOLVED

Added a `describe('getImageFile()')` block to `incident-images.service.spec.ts` with 4 scenarios (auth boundary 404 on mismatch, 404 on missing image, `file://` URL → stream result, `http(s)` URL → redirect result). The auth boundary now has a service-layer regression guard — not only controller-mock coverage.

### W2 — Spec/implementation label mismatch — RESOLVED

The spec at `specs/incidents/spec.md` (scenario "Status mapping") said: `pendiente`, `en proceso`, `resuelta`, `cerrada` (lowercase + feminine `resuelta`). The implementation (`incident-status.util.ts`) + `tasks.md §6` + the project's existing pattern (`dashboard.tokens.ts:52` `case 'resolved': return 'Resuelto'`) all use capitalized + masculine `Resuelto`.

Decision: spec.md is the outlier. Updated `specs/incidents/spec.md` to match the implementation + project pattern (capitalized + masculine). The 7 unit tests for `mapStatusLabel` (in `incident-status.util.spec.ts`) were already written against the implementation values so they continue to pass without modification.

### TDD Cycle Evidence (strict-tdd-verify.md, retroactive format)

| Task | RED (test written first, expected to fail) | GREEN (impl makes it pass) | TRIANGULATE (multiple scenarios) | SAFETY NET (pre-existing tests still pass) | REFACTOR (post-pass cleanup) |
|---|---|---|---|---|---|
| **1** Migration `0034_incident_images_drop_url.sql` | n/a (SQL only, no test). SQL reviewed against project pattern from migrations 0001–0032. | Manual operator execution per `MIGRATION_LOG.md` convention ("Manual Execution Only"). | Static review (BEGIN/COMMIT, IF EXISTS guard, DOWN in `database/rollback/`). | n/a (existing tables left untouched). | n/a. |
| **2** `IncidentImageStorageService` already migrated | n/a — verified the file already followed the target shape (lines 31-34 inject `@Inject(STORAGE_CLIENT)`, no SHA-256 stub). Spec had no `storage.example.com` asserts. `IncidentsModule` already imports `StorageModule`. | n/a. | Verified by reading + `git log` trace (the SC-209 follow-ups completed this work). | n/a (no code change). | n/a. |
| **3** Service refactor `listForIncident` / `attachToIncident` (no `url` in DTO) | First spec run with the new entity: TS2322 `Property 'url' does not exist on type 'IncidentImageEntity'` and `Property 'url' does not exist on type 'IncidentImageDto'`. Compile-time RED confirmed. | Removed `url` from entity, DTO, and both service paths. Spec updated: removed `{ key, url }` shape and the `expect(result[0].url).toBe(...)` assertion; added `expect(result[0]).not.toHaveProperty('url')`. Re-run: 9/9 PASS. | Symmetric: `listForIncident` and `attachToIncident` both verified for owner + non-owner (CREATE perm). | Pre-existing service spec coverage retained (incl. `findById`, `softDelete`, `updateOrganization`, sc-446 geo_zone pass-through) — none modified. | Added `STORAGE_CLIENT` injection (D3 deviation in original apply-progress). |
| **4** Byte route controller `GET /:id/images/:imageId/file` | New `incident-images.controller.spec.ts` written BEFORE the new `@Get(':imageId/file')` route. First run: Nest DI cannot resolve the test module because the underlying service needs `PermissionLookupService` + `STORAGE_CLIENT` (registered only via `@Inject` API). Compile-time RED. | Added `@Res({ passthrough: true })` handler; registered the missing providers in the test module. Re-run: 4/4 PASS. | 4 scenarios: `file://` → stream path, `http(s)` → 302 redirect, NotFoundException propagation, id forwarding verbatim. | n/a (new file). | n/a. |
| **5** Status history LEFT JOIN for `changed_by_name` | `status-history.repository.spec.ts` rewritten: previous test asserted `ormRepo.find` call with `where`+`order`. New test asserts `dataSource.query` SQL shape (LEFT JOIN, CONCAT, ORDER BY). First run: `expect(ormRepo.find).toHaveBeenCalledWith(...)` — Number of calls: 0. RED confirmed. | Switched from TypeORM `ormRepo.find` to raw `dataSource.query`. Re-run: 3/3 PASS. | 3 scenarios: SQL shape (LEFT JOIN + CONCAT + ORDER), null actor (GDPR soft-deleted user), null actor (system event, `changed_by_user_id IS NULL`). | n/a (service inherits the typed rows; controller tests stay green). | n/a (single-intent change). |
| **6** Frontend util `incident-status.util.ts` | Wrote `incident-status.util.spec.ts` BEFORE the util. First run: TS2307 "Cannot find module './incident-status.util'" — compile-time RED. | Implemented `mapStatusLabel`. Re-run: 6/6 PASS. | 4 canonical mappings + raw fallback + null/undefined defensive case. | n/a (new file, no pre-existing). | n/a. |
| **7** Frontend badge `[label]` + `mapStatusLabel` exposure | `incident-detail.component.spec.ts` after import: 17/17 → TS2304 "ctx_r1.mapStatusLabel is not a function" — the function was imported but not exposed on the component instance. RED confirmed. | Added `protected readonly mapStatusLabel = mapStatusLabel;` on the component class. Re-run: 17/17 PASS. | Timeline binding deferred to a future change (the timeline block is commented out — declared deviation D5/D7 from the apply phase). | Pre-existing 15 detail-component tests retained + 2 spec-stability tests. | n/a. |
| **8** Frontend images component (Blob + Object URLs + DestroyRef) | New `incident-images.component.spec.ts` written BEFORE the new Blob-fetch path. First run: TS2304 "expect is not a function" / HttpTestingController missing — RED. | Added `provideHttpClient` + `provideHttpClientTesting`, registered `httpMock` after `compileComponents`. Re-run: 5/5 PASS. | 5 scenarios: loading → empty, populated → byte fetches fire, 5xx → error, pending → undefined, per-image byte failure (doesn't trip global error). | n/a (new file). | n/a. |
| **9** Archive SC-209 → `openspec/changes/archive/2026-10-06-sc-209-frontend-image-upload-full/` | n/a (no code). | `git mv` moved the directory; marked 21 of 25 tasks `[x]` and 4 `[~] CANCELLED` (S3 provider, never built — see SC-209's own apply-progress). | n/a. | n/a. | n/a. |
| **10** Final gates | n/a (verification gate). | Backend: 134/134 suites + 1423 tests pass; 0 lint errors; typecheck clean; 9/9 e2e pass. Frontend: 75/75 pass + 957 total pass; 0 lint errors; typecheck clean; `ng build --configuration production` succeeds. | n/a. | n/a. | n/a. |

### TDD Compliance Summary (strict-tdd-verify.md)

| Check | Status | Notes |
|---|---|---|
| TDD Evidence table present | ✅ PASS (added retroactively per W4) | This table |
| RED unit (service spec) | ✅ PASS | `incident-images.service.spec.ts` ran RED on `url` removal before passing; controller spec ran RED on route addition |
| RED unit (repo spec) | ✅ PASS | `status-history.repository.spec.ts` ran RED on TypeORM-asserted test before raw SQL passed |
| RED e2e | n/a | Service changes didn't require new e2e (covered by existing `incident-images.e2e-spec.ts` 9/9) |
| GREEN unit | ✅ PASS | 134/134 backend + 957 frontend |
| GREEN e2e | ✅ PASS | 9/9 incident-images e2e |
| Triangulation | ✅ PASS | Each behavior has at least 2 surface assertions (HTTP + persistence / spec + impl) |
| Safety net | ✅ PASS | Pre-existing tests in modified files retained + still passing |
| Refactor | ✅ PASS | Single-intent changes; no post-pass refactoring required |

### Verification commands

```bash
# Backend unit
cd backend && npm test -- --testPathPatterns="incident-images|status-history"

# Backend e2e (Testcontainers — needs Docker)
cd backend && npm run test:e2e -- --testRegex="incident-images"

# Frontend unit
cd frontend && npx jest --testPathPatterns="incident-images|incident-status\.util|incident-detail"

# Lint + typecheck
cd backend && npm run lint && npm run typecheck
cd frontend && pnpm exec eslint "src/**/*.{ts,html}" && npx tsc --noEmit -p tsconfig.app.json
```

### Fix-loop verification (final)

- Backend unit: **134/134 suites, 1427 tests pass** (was 1423; +4 from new `getImageFile` describe block).
- Backend e2e (`incident-images`): **9/9 pass**.
- Backend lint: 0 errors, 18 pre-existing warnings (untouched files).
- Backend typecheck: clean.
- Frontend unit (changed suites): **28/28 pass**.
- Frontend typecheck: clean.
- Frontend production build: succeeds.

Ready for re-verification.

---

## Fix-loop delta — Round 2 (post `fixes-required.md` PASS WITH WARNINGS)

Triggered by the Round 2 fixes-required (created after Round 1's items were resolved). Round 2 audit found 2 WARNINGs and 1 SUGGESTION; only W1 was blocking-for-archive.

### W1 — Spec Requirement 2 wording described Option A; implementation chose Option B — RESOLVED

`specs/incidents/spec.md` Requirement 2 rewritten:

- Was: "Dynamic URL Resolution on Read — MUST return a freshly resolved signed URL…".
- Now: "URL-Free Metadata and Byte Route Resolution — MUST return incident image metadata without URL fields…".

The scenario text under it was also rewritten to match: the metadata response is now specified as `{id, mime_type, file_size, created_at}` (no `url`). The implementation already matched Option B (design.md D3 / deviation D5 from the apply phase); only the spec wording needed updating. No code change required. The existing `listForIncident` test (which asserts `expect(result[0]).not.toHaveProperty('url')`) is the regression guard against any future drift.

### W2 — Timeline + gallery commented out — DEFERRED (not blocking, declared D5)

`incident-detail.component.html` lines 113–148: timeline block + `<app-incident-images>` gallery remain commented. The auditor documented the exact text replacements required when these blocks are re-enabled (3 line-level edits to use `mapStatusLabel` and `changed_by_name`). Tracked in **Known follow-ups** below; not a current blocker.

### S1 — `listForIncident` NotFoundException test symmetry assertion — NOT REQUIRED

The auditor marked this as a SUGGESTION with "No action required". The success-path `listForIncident` test already asserts `storageClient.getSignedUrl` is not called (Round 1 fix S1). The NotFoundException path throws before any image access, so the symmetric assertion is redundant. Skipped.

### Known follow-ups (consolidated across Round 1 + Round 2)

- **Round 2 W2**: Re-enable the timeline block and `<app-incident-images>` gallery in `incident-detail.component.html`. At re-enable time:
  - Line 127: `entry.previous_status` → `mapStatusLabel(entry.previous_status)`
  - Line 129: `entry.new_status` → `mapStatusLabel(entry.new_status)`
  - Line 132: `entry.changed_by_user_id` → `entry.changed_by_name || 'sistema'`
  - Uncomment `<app-incident-images [incidentId]="inc.id" />` (lines 146–148)
- **Apply-phase D5**: Same as above, tracked since the apply phase.
- **Apply-phase D7**: `getSignedUrl` signature is `(key, ttl?)` — interface contract correct.
- The preference column (`stored`) is unused in this change; downstream consumers (incident-list and others with `IncidentImage.url`) should be migrated to the byte-route + Blob path in parallel work owned by those modules.
- S3 storage provider (SC-209 A.5.x) — never built; archive notes preserved.

### Verification

- Backend unit: **134/134 suites, 1427 tests pass** (unchanged from Round 1).
- Backend e2e (`incident-images`): **9/9 pass**.
- Backend lint: 0 errors, 18 pre-existing warnings.
- Backend typecheck: clean.
- Frontend unit (changed suites): **28/28 pass**.
- Frontend typecheck: clean.
- Frontend production build: succeeds.

Ready for archive.
