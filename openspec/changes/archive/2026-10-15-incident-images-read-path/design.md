# Design: Incident Images Read Path & Timeline Polish

## Technical Approach

This change implements the read path for incident images by migrating the backend to the `STORAGE_CLIENT` seam (introduced in SC-209) and adding a dedicated HTTP byte route. This approach guarantees that images are served securely and uniformly in both local environments (streaming via the `noop` client) and production (via 302 redirects to fresh Supabase signed URLs). On the frontend, it polishes the timeline by defining a single shared pure function to translate status keys into Spanish and surfaces the actor's name by performing a repository-level database join.

## Architecture Decisions

### Decision 1: Wiring StorageModule into IncidentsModule
**Choice**: Import `StorageModule` in `IncidentsModule` and inject the `STORAGE_CLIENT` token into `IncidentImageStorageService` exactly as done in `CommentsModule`.
**Alternatives considered**: Hardcoding the Supabase client inside the service.
**Rationale**: Reusing the existing `StorageProviderFactory` ensures environment-agnostic behavior (Supabase in production, noop locally) and strictly mirrors the successfully migrated `CommentsModule` pattern.

### Decision 2: Incident Image Persistence (Schema Delta)
**Choice**: Drop the `url` column from the `incident_images` table entirely using a SQL migration file in `database/migrations/`, and purge the 2 dead rows.
**Alternatives considered**: Keeping `url` or repurposing it to hold the `storage_key`.
**Rationale**: `IncidentImageEntity` already contains `storage_key`. Removing the unused `url` column eliminates a duplicate, stale source of truth and enforces the specification requirement to not persist fabricated or dummy URLs.

### Decision 3: Read Path Canonical Approach
**Choice**: Choose Option (b) as primary. The metadata endpoint (`GET /incidents/:id/images`) will return DTOs *without* a URL. The frontend will ALWAYS render images by fetching the dedicated byte route (`GET /incidents/:id/images/:imageId/file`).
**Alternatives considered**: (Option A) The metadata endpoint dynamically resolves and returns fresh provider URLs (`getSignedUrl`).
**Rationale**: Option B is uniquely local-dev-friendly. The local `noop` storage client returns `file://` URLs, which browsers strictly block for security. Option B solves this by piping the local file directly through the backend route while retaining the ability to issue 302 redirects to Supabase in production.

### Decision 4: Byte Route Signature & Authentication
**Choice**: Implement the byte route with `@UseGuards(JwtAuthGuard)` and a signature: `getFile(@Param('id') id, @Param('imageId') imageId, @Res() res)`. The frontend will use `HttpClient` to fetch the bytes as a Blob and create a local Object URL.
**Alternatives considered**: Exposing a public, unauthenticated byte route requiring unguessable UUIDs.
**Rationale**: The specification strictly mandates an authorization boundary preventing cross-incident image leakage. Checking authorization and resolving the image dynamically natively solves this. Setting `Content-Type` from the stored MIME type and `Content-Disposition: inline; filename="..."` ensures proper browser rendering.

### Decision 5: Timeline Statuses
**Choice**: Create a pure function `mapStatusLabel(status: string): string` in a new shared utility `frontend/src/app/shared/utils/incident-status.util.ts`. Refactor `badgeStatusFor` in the detail component to use this function.
**Alternatives considered**: Duplicating maps in the component or template.
**Rationale**: A single shared function prevents divergence between badges and timelines. Unknown keys (e.g. legacy `previous_status`) gracefully fallback to the raw string.

### Decision 6: Actor Name Resolution
**Choice**: Implement a `LEFT JOIN users` in the repository query fetching `status_history` to map `users.full_name` to a new `changed_by_name` DTO property.
**Alternatives considered**: Batch user lookup in the service or leaving resolution to the frontend.
**Rationale**: The database join avoids an N+1 query footprint entirely and requires zero additional HTTP overhead. Since incidents are already scope-filtered for the caller, exposing the actor name complies with visibility rules.

## Data Flow

```
Frontend `<app-incident-images>` 
  ──(1) HttpClient GET (Blob) ──→ `GET /incidents/:id/images/:imageId/file`
                                     │
                                     ├─ Verify user visibility & `image.incidentId === id`
                                     ├─ Call `client.getSignedUrl(storageKey)`
                                     │
                                     ├─ If `file://` (noop) ──→ fs.createReadStream().pipe(res)
                                     └─ If `http...` (Supa) ──→ res.redirect(302, url)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/entities/incident-image.entity.ts` | Modify | Remove `url` property. |
| `database/migrations/<timestamp>_remove_incident_image_url.sql` | Create | Contains `ALTER TABLE incident_images DROP COLUMN url;` and `DELETE FROM incident_images;`. |
| `backend/src/modules/incidents/incidents.module.ts` | Modify | Add `StorageModule` to imports array. |
| `backend/src/modules/incidents/incident-image-storage.service.ts` | Modify | Inject `@Inject(STORAGE_CLIENT)`, implement `getSignedUrl` and `delete`, remove UUID mock host generation. |
| `backend/src/modules/incidents/incident-images.service.ts` | Modify | Omit `url` generation from `attachToIncident`, remove `url` mapping from `listForIncident` DTOs. |
| `backend/src/modules/incidents/incident-images.controller.ts` | Modify | Add `GET /:id/images/:imageId/file` route protected by `JwtAuthGuard`. |
| `backend/src/modules/status-history/status-history.repository.ts` (or equivalent service query) | Modify | Add `LEFT JOIN users ON users.id = status_history.changed_by_user_id` to fetch the full name. |
| `frontend/src/app/core/models/status-history.model.ts` | Modify | Add `changed_by_name?: string | null` to `StatusHistoryEntry`. |
| `frontend/src/app/shared/utils/incident-status.util.ts` | Create | Implement and export pure `mapStatusLabel(status)` function. |
| `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts` | Modify | Delegate `badgeStatusFor` to `mapStatusLabel`. |
| `frontend/src/app/features/incidents/incident-detail/incident-detail.component.html` | Modify | Update the timeline loop to use `mapStatusLabel` for statuses and display `entry.changed_by_name`. |
| `frontend/src/app/shared/components/incident-images/incident-images.component.ts` | Modify | Transform incoming image data to Blob Object URLs via `HttpClient` fetching the byte route. Handle loading, empty, and error states gracefully. |

## Interfaces / Contracts

```typescript
// backend/src/modules/incidents/dto/incident-image.dto.ts
export interface IncidentImageDto {
  id: string;
  // url removed
  mime_type: string;
  file_size: number;
  created_at: Date;
}
```

```typescript
// frontend/src/app/shared/utils/incident-status.util.ts
export function mapStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    pending: 'pendiente',
    in_progress: 'en proceso',
    resolved: 'resuelto',
    closed: 'cerrada',
  };
  return statusMap[status] || status; // fallback
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (Backend) | `IncidentImageStorageService` | `pnpm test` (from `backend/`). Mock `STORAGE_CLIENT`. Verify `upload` persists key, `getSignedUrl` passes key, and `delete` delegates properly. |
| Unit (Backend) | `IncidentImagesController.getFile` | `pnpm test` (from `backend/`). Verify 404 for unknown/mismatched image IDs. Verify 302 HTTP redirects and byte streaming mechanics. |
| Unit (Backend) | Status history query | `pnpm test` (from `backend/`). Verify `changed_by_name` resolves to `users.full_name`. |
| Unit (Frontend) | `mapStatusLabel` | `pnpm test` (from `frontend/`). Test mapped values, and verify raw string fallback for unknown keys. |
| Unit (Frontend) | `IncidentImagesComponent` | `pnpm test` (from `frontend/`). Test rendering of empty, loading, and error UI states. Verify URL generation mechanism. |
| Integration | Build verification | Backend: `pnpm run build` (from `backend/`); Frontend: `pnpm run build` (from `frontend/`). |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

A simple database schema migration will drop the `url` column from the `incident_images` table and delete the two legacy broken rows to reset the table properly. No data backfill or feature flags are required as this applies strictly to stateless runtime resolution.

## Open Questions

- None.

## Size Estimate

Forecasted authored changed lines: ~200 lines (Backend: ~120, Frontend: ~80). This easily fits well within the 400-line recommended heuristic limit.
Decision needed before apply: No.
