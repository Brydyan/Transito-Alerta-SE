// F3 (sc-303) — F3.1.1 contract revalidation against `incidents.controller.ts`.
//
// The previous model declared only a subset of the wire fields. The defects
// the audit found in sc-315 (closed states added in the backend) and the
// incremental fields added across t5.x are now reflected here. The model
// matches the columns of `IncidentsRepository.IncidentRow` from the backend
// after `SnakeCaseResponseInterceptor` (snake_case throughout).
//
// Note on `status` and `priority` — 4 values, not 3. The frontend was stuck
// on the old 3-state assumption that sc-315 (this session, prior turn)
// just closed; the model now reflects the 4-state machine of
// `incident-state-machine.ts`. `closed` and `critical` are reachable.

export type IncidentStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';
export type IncidentPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Incident {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  priority: IncidentPriority;
  // Geo
  lat: number;
  lng: number;
  geom?: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
  };
  zone_id: string | null;
  geofence_matched: boolean;
  organization_id: string | null;
  // Ownership
  citizen_id: string;
  assigned_to: string | null;
  category_id: string | null;
  claimed_by: string | null;
  claimed_at: Date | null;
  // Workflow audit (t5.6)
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  closed_reason: string | null;
  resolution_date: Date | null;
  // Audit
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  // Social (F4 Phase A)
  follower_count: number;
  corroboration_count: number;
  is_followed_by_me: boolean;
  is_corroborated_by_me: boolean;
}

export interface CreateIncidentDto {
  title: string;
  description: string;
  lat: number;
  lng: number;
  priority?: IncidentPriority;
  category_id?: string;
  is_anonymous?: boolean;
}

// F3.1.3 (D2 + F3.2.9) — typed filters for the listing. Sent as query
// params to `GET /api/incidents` and `GET /api/incidents/feed`.
//
// F3 (sc-303) C1 (ronda 4) — updated (pagination): `GET /api/incidents/feed`
// now supports `status`, `priority`, `page`, `per_page`,
// `incident_category_id` (consumed by the citizen feed). `GET /api/incidents`
// listing still only honors `status` and silently ignores the rest.
// `search` remains unsupported by the feed endpoint and stays commented
// as debt — do not send it to `/incidents/feed`.
export interface IncidentListFilters {
  status?: IncidentStatus;
  priority?: IncidentPriority;
  page?: number;
  per_page?: number;
  incident_category_id?: string;
  // DEBT — feed endpoint does not support search:
  //   - search?: string;            (ILIKE sobre title/description)
}

export interface IncidentFeedMeta {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface IncidentFeedResponse {
  data: Incident[];
  meta: IncidentFeedMeta;
}

// La respuesta del backend hoy es un array plano. La envoltura
// `IncidentListResult` se mantiene para que cuando el backend
// agregue un `X-Total-Count` o un envelope, los consumidores
// (el listado, los charts) no tengan que cambiar.
export interface IncidentListResult {
  items: Incident[];
  total: number;
  page: number;
  limit: number;
}

/**
 * F3 (sc-303) C2 (ronda 5): Tipo derivado del wire para `POST /incidents/:id/release`.
 * Debe coincidir con `ClaimReleaseResponseDto` tras `SnakeCaseResponseInterceptor`.
 */
export interface ClaimReleaseResult {
  id: string;
  title: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  claimed_by: string | null;
  organization_id: string | null;
  updated_at: Date;
}

/**
 * F4 B.2 — Wire model for `POST /incidents/:id/images` and
 * `DELETE /incidents/:id/images/:imageId`. Mirrors `IncidentImageDto`
 * (backend) after `SnakeCaseResponseInterceptor` (snake_case throughout).
 */
export interface IncidentImage {
  id: string;
  url: string;
  mime_type: string;
  file_size: number;
  created_at: Date;
}
