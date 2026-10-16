// F3 (sc-303) — F3.1.6 status-history model.
//
// Wire shape derived from `StatusHistoryEntity` on the backend
// (`backend/src/entities/status-history.entity.ts`) after
// `SnakeCaseResponseInterceptor`. Snake_case throughout.

import { IncidentStatus } from './incident.model';

export interface StatusHistoryEntry {
  id: string;
  incident_id: string;
  changed_by_user_id: string | null;
  previous_status: string; // raw, the timeline may include states outside our 4-state machine if a future change adds one
  new_status: IncidentStatus;
  notes: string | null;
  event_id: string;
  created_at: Date;
  /**
   * 2026-10-06-incident-images-read-path (D6) — actor name resolved
   * server-side via `LEFT JOIN users` on the backend; the wire is
   * `changed_by_name` (snake_case, see `StatusHistoryEntity` and
   * `StatusHistoryService.findByIncident`). `null` when the actor
   * was the system (no user id) or the actor's `users` row was
   * GDPR-soft-deleted — the timeline surfaces `'sistema'` in that
   * case.
   */
  changed_by_name?: string | null;
}

// Envelope returned by `GET /incidents/:incidentId/status-history`.
// Mirrors `StatusHistoryListResult` on the backend.
export interface StatusHistoryListResult {
  items: StatusHistoryEntry[];
  total: number;
}
