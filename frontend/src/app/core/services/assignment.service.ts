import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { HttpService } from './http.service';

/**
 * Wire shapes for the assignments API.
 * Matches backend `AssignmentEntity` after `SnakeCaseResponseInterceptor`.
 */
export interface AssignmentResult {
  id: string;
  incident_id: string;
  operator_id: string;
  role: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  cap_override_reason?: string | null;
  cap_override_by?: string | null;
}

/**
 * 2026-10-17-F7-dispatch-ui — shape returned by
 * `GET /api/incidents/:id/available-operators`. Matches the
 * backend DTO `AvailableOperatorDto` (snake_case → camelCase via
 * `SnakeCaseResponseInterceptor`).
 *
 * Note: the endpoint now returns ALL operators including saturated
 * ones (`available: false`). The UI uses `activeClaimCount` and
 * `maxActive` to render «3 de 3» for saturated entries; the filter
 * happens client-side.
 */
export interface AvailableOperatorForIncident {
  id: string;
  name: string;
  email: string | null;
  activeClaimCount: number;
  available: boolean;
  maxActive: number;
}

/**
 * Optional override fields for assign() / reassign(). When
 * `overrideCap` is true the backend permits assigning past the
 * operator's `maxActive` (F7 emergency-dispatch design D3). The
 * operator receives a Telegram notification with `overrideReason`
 * (D11). Required when `overrideCap` is true; the service layer
 * surfaces a 422 with code `CAP_OVERRIDE_REASON_REQUIRED` if missing.
 */
export interface AssignOverrideOptions {
  overrideCap?: boolean;
  overrideReason?: string;
}

/**
 * Extended assignment with operator display name.
 * Used by the tracking panel to show who is handling an incident.
 */
export interface Assignment extends AssignmentResult {
  operator_name?: string;
}

/**
 * Operator workload count response from
 * GET /assignments/operator/:operatorId/count
 *
 * Design decision D4: dedicated COUNT(*) endpoint; avoids N+1 queries
 * when rendering workload for multiple operators in the assignment modal.
 */
export interface OperatorWorkload {
  count: number;
  operator_id: string;
}

/**
 * Operator location record from GET /operator/locations.
 * Used to populate the operator panel in the assignment modal.
 */
export interface AvailableOperator {
  user_id: string;
  lat: number | null;
  lng: number | null;
  updated_at: string;
  operator_name?: string;
}

/**
 * AssignmentService — Phase 2 of incidents-assignment feature.
 *
 * Wraps all assignment-related backend endpoints into typed Observables.
 * Uses the shared `HttpService` (same pattern as `IncidentService`).
 *
 * Endpoints used:
 *   POST   /assignments                         — create assignment
 *   GET    /assignments/operator/:id/count      — operator workload (new in Phase 1)
 *   GET    /operator/locations                 — available operators list
 *   GET    /assignments/incident/:id            — list assignments for incident (latest)
 */
@Injectable({
  providedIn: 'root',
})
export class AssignmentService {
  constructor(private readonly httpService: HttpService) {}

  /**
   * POST /assignments — assign an incident to an operator.
   *
   * Backend returns 201 on success, 409 if the incident is already
   * assigned. The 409 is NOT caught here — callers (AssignmentModal)
   * handle it and show the "Este incidente ya fue asignado" toast.
   *
   * 2026-10-17-F7-dispatch-ui — `opts` agrega `overrideCap` /
   * `overrideReason` para el flow F7 emergency-dispatch (design D3):
   * cuando el operador está en su tope y el incidente es `critical`,
   * el admin puede forzar la asignación. Los campos NO se incluyen
   * en el body cuando el caller no los pasa (back-compat).
   */
  assign(
    incidentId: string,
    operatorId: string,
    opts: AssignOverrideOptions = {},
  ): Observable<AssignmentResult> {
    const body: Record<string, unknown> = {
      incident_id: incidentId,
      operator_id: operatorId,
    };
    if (opts.overrideCap) {
      body['override_cap'] = opts.overrideCap;
    }
    if (opts.overrideReason) {
      body['override_reason'] = opts.overrideReason;
    }
    return this.httpService.post<AssignmentResult>('/assignments', body);
  }

  /**
   * GET /assignments/operator/:operatorId/count
   *
   * Returns the number of active (non-soft-deleted) assignments for
   * the given operator. Used to show workload in the assignment modal.
   *
   * Design D4: lightweight COUNT(*) — no joins.
   */
  getOperatorWorkload(operatorId: string): Observable<OperatorWorkload> {
    return this.httpService.get<OperatorWorkload>(`/assignments/operator/${operatorId}/count`);
  }

  /**
   * GET /operator/locations
   *
   * Returns operators with their current location info.
   * Used to build the operator list panel in the assignment modal.
   */
  getAvailableOperators(): Observable<AvailableOperator[]> {
    return this.httpService
      .get<{ operators: AvailableOperator[] }>('/operator/locations')
      .pipe(map((res) => res.operators ?? []));
  }

  /**
   * GET /assignments/incident/:incidentId
   *
   * Lists assignments for an incident; returns the first active one
   * (latest assignment). Used by the tracking panel.
   *
   * Returns `null` when the incident has no active assignments yet.
   */
  getLatestAssignment(incidentId: string): Observable<Assignment | null> {
    return this.httpService
      .get<Assignment[]>(`/assignments/incident/${incidentId}`)
      .pipe(map((assignments) => (assignments.length > 0 ? assignments[0] : null)));
  }

  /**
   * 2026-10-17-F7-dispatch-ui — lista de operadores disponibles
   * para un incidente específico. Devuelve TODOS los operadores
   * (incluso saturados) — el filtrado es client-side via
   * `available: false`. El endpoint es incident-scoped (no global)
   * porque filtra por organización del incidente y excluye al
   * operador actual si ya está reclamado.
   */
  getAvailableOperatorsForIncident(
    incidentId: string,
  ): Observable<AvailableOperatorForIncident[]> {
    return this.httpService.get<AvailableOperatorForIncident[]>(
      `/incidents/${incidentId}/available-operators`,
    );
  }

  /**
   * 2026-10-17-F7-dispatch-ui — DELETE /assignments/:id. Libera la
   * asignación sin cambiar el status del incidente. Usado por el
   * flow de reasignación: si la reasignación vía PATCH falla con
   * 422 (otro operador ya asignado), el admin puede liberar
   * primero y luego re-intentar.
   */
  release(assignmentId: string): Observable<void> {
    return this.httpService.delete<void>(`/assignments/${assignmentId}`);
  }

  /**
   * 2026-10-17-F7-dispatch-ui — PATCH /assignments/:id. Reasignar a
   * un operador distinto (o cambiar el rol). Acepta los mismos
   * override fields que `assign()` (F7 emergency-dispatch design D3).
   * El backend emite 409 si hay otra asignación activa para el mismo
   * incidente — el caller maneja el error.
   */
  reassign(
    assignmentId: string,
    operatorId: string,
    opts: AssignOverrideOptions = {},
  ): Observable<AssignmentResult> {
    const body: Record<string, unknown> = { operator_id: operatorId };
    if (opts.overrideCap) {
      body['override_cap'] = opts.overrideCap;
    }
    if (opts.overrideReason) {
      body['override_reason'] = opts.overrideReason;
    }
    return this.httpService.patch<AssignmentResult>(
      `/assignments/${assignmentId}`,
      body,
    );
  }
}
