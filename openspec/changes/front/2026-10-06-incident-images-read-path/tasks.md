# Tasks: Incident Images Read Path & Timeline Polish

Legend: `- [ ]` = pending, `- [x]` = done only after observed verification.
Total tasks: 10

### Dependencies
- Task 1 must be completed before Task 3.
- Task 2 must be completed before Task 4.
- Task 3 must be completed before Task 8.
- Task 5 must be completed before Task 7.
- Task 6 must be completed before Task 7.
- Task 9 is independent.
- Task 10 is the final verification after all other tasks.

## Phase 1: Database & Storage Migration

- [ ] 1. DB migration: Create new file `database/migrations/0067_incident_images_drop_url_cleanup.sql`. DROP COLUMN `url` and DELETE the 2 dead `incident_images` rows. Note: schema syncing or running migrations via script.
  - RED -> GREEN: Verify migration syntax by running `backend/scripts/apply-pending-migrations.sh`. The DB schema should successfully update.
  - Focused test command: `backend/scripts/apply-pending-migrations.sh`
  - Runtime harness: Verify DB schema reflects dropped column via `psql` or `pgAdmin`.
  - Rollback boundary: Revert migration file and re-add column.

- [ ] 2. Backend storage migration: Update `backend/src/modules/incidents/incident-image-storage.service.ts` and `incident-image-storage.service.spec.ts`. Mirror `CommentImageStorageService` by injecting `@Inject(STORAGE_CLIENT)`. Update `upload()` to return the real key, `getSignedUrl()` to delegate to the client, and `delete()` to delegate. Update `IncidentsModule` (`backend/src/modules/incidents/incidents.module.ts`) to import `StorageModule`. Rewrite the two storage spec assertions that expect `storage.example.com` (lines ~44, ~67).
  - RED -> GREEN: `cd backend && pnpm test incident-image-storage.service` fails due to missing client and old assertions. Fix code and update test to pass.
  - Focused test command: `cd backend && pnpm test incident-image-storage.service`
  - Runtime harness: Unit tests verify correct delegation.
  - Rollback boundary: `incident-image-storage.service.ts` and its spec, `incidents.module.ts`.

## Phase 2: Backend Read Path & Byte Route

- [ ] 3. Backend service read path: Update `backend/src/modules/incidents/incident-images.service.ts` and `incident-images.service.spec.ts`. `attachToIncident` stops persisting `url`. `listForIncident` returns DTO WITHOUT `url` (shape: `id`, `mime_type`, `file_size`, `created_at`). Update spec mocks/assertions (remove `{ key, url }` at ~122, ~138).
  - RED -> GREEN: `cd backend && pnpm test incident-images.service` fails expecting `url`. Remove `url` mapping and update test assertions to expect new DTO. Test passes.
  - Focused test command: `cd backend && pnpm test incident-images.service`
  - Runtime harness: Unit tests verify DTO shape.
  - Rollback boundary: `incident-images.service.ts` and its spec.

- [ ] 4. Backend byte route: Update `backend/src/modules/incidents/incident-images.controller.ts` and `incident-images.controller.spec.ts`. Add `GET /:id/images/:imageId/file` with `@UseGuards(JwtAuthGuard)`. Verify `image.incidentId === :id` (404 otherwise). If provider is noop/`file://`, use Node `fileURLToPath` for `StreamableFile` from disk. If `http(s)`, 302 redirect to fresh signed URL. Set `Content-Type` from `mime_type`, `Content-Disposition: inline`.
  - RED -> GREEN: `cd backend && pnpm test incident-images.controller` fails on missing route. Implement route and stream/redirect logic. Test passes (404, redirect, stream, mime).
  - Focused test command: `cd backend && pnpm test incident-images.controller`
  - Runtime harness: GET request to route returns bytes or redirect.
  - Rollback boundary: `incident-images.controller.ts` and its spec.

## Phase 3: Status Timeline Polish & Frontend Prep

- [ ] 5. Backend actor name: Update `backend/src/modules/status-history/status-history.repository.ts`, `status-history.service.ts`, `status-history.controller.ts`, and DTOs. Add `LEFT JOIN users u ON u.id = status_history.changed_by_user_id` to compute `changed_by_name` via `CONCAT(u.first_name, ' ', u.last_name)`. Expose `changed_by_name` on the wire (snake_case). Preserve scope/ordering.
  - RED -> GREEN: `cd backend && pnpm test status-history` fails expecting `changed_by_name`. Update repository and DTO. Test passes.
  - Focused test command: `cd backend && pnpm test status-history`
  - Runtime harness: GET `/status-history` endpoint returns `changed_by_name`.
  - Rollback boundary: `status-history.repository.ts`, `status-history.service.ts`, `status-history.controller.ts`.

- [ ] 6. Frontend shared util: Create `frontend/src/app/shared/utils/incident-status.util.ts` and `incident-status.util.spec.ts`. Implement `mapStatusLabel(status: string): string` with formalized text (`pending → 'Pendiente'`, `in_progress → 'En proceso'`, `resolved → 'Resuelto'`, `closed → 'Cerrada'`) + unknown fallback.
  - RED -> GREEN: `cd frontend && pnpm test incident-status.util` fails (not found). Create util and spec testing all 4 keys + unknown. Test passes.
  - Focused test command: `cd frontend && pnpm test incident-status.util`
  - Runtime harness: Unit tests verify mapping.
  - Rollback boundary: `incident-status.util.ts` and its spec.

## Phase 4: Frontend Implementation

- [ ] 7. Frontend badge + timeline: Update `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts`, `.html`, and `frontend/src/app/core/models/status-history.model.ts`. Update `status-history.model.ts` to add `changed_by_name?: string | null`. In `incident-detail.component.ts`, keep `variant` tokens in `badgeStatusFor` but use `mapStatusLabel` for `ui-badge [label]`. In timeline block (~100-130), replace raw keys with `mapStatusLabel(entry.new_status)`/`mapStatusLabel(entry.previous_status)` and show `entry.changed_by_name` (or 'sistema' when null).
  - RED -> GREEN: `cd frontend && pnpm test incident-detail.component` fails due to missing `changed_by_name` bindings and badge property mismatch. Update HTML and component. Test passes.
  - Focused test command: `cd frontend && pnpm test incident-detail.component`
  - Runtime harness: UI visually displays Spanish labels and full names in the browser.
  - Rollback boundary: `incident-detail.component.ts`, `.html`, and model.

- [ ] 8. Frontend images component: Update `frontend/src/app/shared/components/incident-images/incident-images.component.ts` and its spec. Fetch each image via `HttpClient` as `Blob` (URL: `/incidents/{id}/images/{image.id}/file`) and create Object URLs. Implement loading/empty/error states. Release Object URLs on destroy. Update template to bind new state.
  - RED -> GREEN: `cd frontend && pnpm test incident-images.component` fails expecting `url` bindings. Implement Blob fetching and Object URLs. Spec tests for states + blob path pass.
  - Focused test command: `cd frontend && pnpm test incident-images.component`
  - Runtime harness: Images render correctly in browser with local backend.
  - Rollback boundary: `incident-images.component.ts` and its spec.

## Phase 5: Cleanup & Verification

- [ ] 9. Housekeeping SC-209: Move `openspec/changes/front/2026-08-28-sc-209-frontend-image-upload-full/` to `openspec/changes/archive/2026-10-06-sc-209-frontend-image-upload-full/`. Mark truly-implemented tasks `[x]` in its `tasks.md`. Document in verify/archive notes that S3 provider was never built and signature is `getSignedUrl(key)`. Add note redirecting object-storage to this change's spec.
  - RED -> GREEN: N/A (no code).
  - Focused test command: `ls openspec/changes/archive/2026-10-06-sc-209-frontend-image-upload-full/`
  - Runtime harness: N/A.
  - Rollback boundary: Revert directory move.

- [ ] 10. Final gates task: Run full test suites and builds for both backend and frontend.
  - RED -> GREEN: System test and build should pass.
  - Focused test command: `cd backend && pnpm test && pnpm run build && cd ../frontend && pnpm test && pnpm run build`
  - Runtime harness: Full system builds successfully.
  - Rollback boundary: N/A.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated authored changed lines | ~200 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Low
