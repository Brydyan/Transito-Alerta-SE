# Proposal: Incident Images Read Path & Timeline Polish

## Intent

Incident images currently fail to render in the browser, showing `net::ERR_NAME_NOT_RESOLVED` for URLs like `https://storage.example.com/incidents/<uuid>/...jpg?sig=8726afbb...`.

Verified evidence:
1. `IncidentImageStorageService` (`backend/src/modules/incidents/incident-image-storage.service.ts:19-33`) was never migrated to the storage client seam introduced in SC-209 Phase A. Its `upload()` method fabricates a dummy URL, never writes bytes, and `delete()` is a no-op. `IncidentsModule` does not import `StorageModule`.
2. There is no route to serve file bytes over HTTP. The local `NoopStorageClient` writes to `.storage/` and returns `file://` URLs, which browsers block. Production Supabase signed URLs expire after 3600s.
3. The backend currently persists these URLs at upload and returns them as-is. Frontend's `incident-images.component.ts` binds `[src]="img.url"` directly. Persisting a signed URL guarantees it will expire in production and be unusable locally.
4. Data reality: The `incident_images` table contains 2 rows pointing to dead keys whose bytes were never stored, resulting in irrecoverable test data.

Second defect: The status timeline in `incident-detail.component.html` renders raw wire keys (`pending`, `in_progress`) instead of Spanish labels, and raw UUIDs for users instead of actor names. The `StatusHistory` entity/repo exposes `changed_by_user_id` but no actor name.

Relationship to open change SC-209:
SC-209 (`openspec/changes/front/2026-08-28-sc-209-frontend-image-upload-full`) is open but stale. It specified the storage seam but only covered comments and avatars. Incident images and the read-path defect are not covered by any spec. This change extends the `object-storage` capability for incidents using the established SC-209 seam.

## Scope

### In Scope
- **Backend Storage Migration:** Migrate `IncidentImageStorageService` to inject `STORAGE_CLIENT`, removing the fake host/signature. Wire `StorageModule` into `IncidentsModule`.
- **Backend Read Path:** Stop persisting `url` directly as truth. Keep `storage_key`, and resolve a fresh URL at read time (using `getSignedUrl`) in the GET DTO.
- **Backend HTTP Route:** Add a route serving image bytes (e.g., `GET /incidents/:id/images/:imageId/file`) so browsers render locally (reading disk via noop) and in production (via proxy or fresh redirect).
- **Timeline Polish:** Map timeline statuses to Spanish labels via a pure function in the frontend. Resolve `changed_by_name` for the status history actor (or provide a justified lighter alternative).
- **Housekeeping (SC-209):** Reconcile and archive the stale SC-209 change. Mark truly-implemented tasks as done, honestly record the undelivered S3 option, and document the `signedUrl` signature drift (`getSignedUrl` vs `signedUrl(key, ttl)`). This involves `openspec/` file moves only, no code.
- **Data Cleanup:** Clean up the 2 dead `incident_images` rows via a cleanup task (migration or script).

### Out of Scope
- Re-specifying the `object-storage` seam (relying on SC-209 base).
- Building the S3 client option that was missed in SC-209.
- Complex UI redesigns of the incident detail page outside the timeline and image components.

## Capabilities

### Modified Capabilities
- `object-storage`: Extended to handle incident images via the existing seam.
- `incidents`: Upgraded with a proper HTTP byte route for image reading and fresh signed URL resolution at read time. Status history enriched with actor names.

## Approach

1. **SC-209 Archive:** Move SC-209 to `archive/` and update `specs/object-storage/spec.md` with the true current state (no S3, `getSignedUrl` signature).
2. **Backend Persistence:** Update `incident-images.service.ts` to rely on `storage_key`. DTOs will dynamically resolve the fresh URL upon request.
3. **Backend Byte Route:** Implement `GET /incidents/:id/images/:imageId/file` in `incident-images.controller.ts` to return bytes or a redirect.
4. **Storage Seam Extension:** Update `IncidentImageStorageService` to use the real storage client and register `StorageModule` in `IncidentsModule`.
5. **Timeline Fixes:** Add a lightweight user lookup or SQL join in `status-history.repository.ts` for `changed_by_name`. Update frontend model and template to map statuses using a pure function.
6. **Frontend Images:** Update `incident-images.component.ts` to consume the new backend-served route and handle errors/empty states appropriately.
7. **Testing:** Strict TDD across backend (`pnpm test`) and frontend (`pnpm test`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/modules/incidents/incident-image-storage.service.ts` | Modified | Inject `STORAGE_CLIENT`, remove fake generation |
| `backend/src/modules/incidents/incidents.module.ts` | Modified | Import `StorageModule` |
| `backend/src/modules/incidents/incident-images.service.ts` | Modified | Dynamic URL resolution, drop `url` persistence dependency |
| `backend/src/modules/incidents/incident-images.controller.ts` | Modified | Add `GET .../file` HTTP route |
| `backend/src/entities/status-history.entity.ts` & repo | Modified | Add `changed_by_name` resolution |
| `frontend/src/app/shared/components/incident-images/*` | Modified | Bind to HTTP route, error handling |
| `frontend/src/app/features/incidents/incident-detail/*` | Modified | Timeline labels & actor names |
| `frontend/src/app/core/models/status-history.model.ts` | Modified | Add `changed_by_name` |
| `openspec/changes/front/2026-08-28-sc-209-frontend-image-upload-full` | Moved | Archived with reality checks |

## Risks / Open Questions

| Risk | Mitigation |
|------|------------|
| **Size / Scope Creep:** The combined backend and frontend work might exceed the ~400 forecasted authored changed lines limit. | Monitor implementation size. If the forecast exceeds 400 lines, flag a split (e.g., separating the timeline polish from the image read path) with **Decision needed before apply: Yes** before proceeding. |
| **Irrecoverable Dead Data:** The 2 existing rows in `incident_images` are broken. | Execute a documented cleanup task to purge or migrate these broken rows. |
