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
}

export interface CreateIncidentDto {
  title: string;
  description: string;
  lat: number;
  lng: number;
  priority?: IncidentPriority;
  category_ids?: string[];
}

// F3.1.3 (D2 + F3.2.9) — typed filters for the listing. Sent as query
// params to `GET /api/incidents`.
//
// F3 (sc-303) C1 (ronda 4): el backend `incidents.controller.ts:findAll`
// hoy sólo acepta `zone_id` y `status` — los demás filtros (search,
// priority, page, limit, category_id) llegan al servidor pero los
// ignora en silencio. Hasta que un change de backend extienda
// `findAll` (es scope de un change aparte, no se parchea en F3
// per la regla del builder "no parchees defectos del backend en
// el frontend"), el frontend manda sólo lo que el backend entiende:
// `status`. Los campos restantes quedan comentados en este
// interface como deuda documentada.
export interface IncidentListFilters {
  status?: IncidentStatus;
  // DEBT (F3 / sc-303 C1) — pendiente de extensión de backend:
  //   - search?: string;            (ILIKE sobre title/description)
  //   - priority?: IncidentPriority;
  //   - page?: number;              (OFFSET)
  //   - limit?: number;             (LIMIT)
  //   - category_id?: string;
  // Cuando el backend los soporte, descomentar aquí y en
  // `IncidentService.toQueryParams()`.
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
