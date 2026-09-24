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
 * Operator location record from GET /operators/locations.
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
 *   GET    /operators/locations                 — available operators list
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
   */
  assign(incidentId: string, operatorId: string): Observable<AssignmentResult> {
    return this.httpService.post<AssignmentResult>('/assignments', {
      incident_id: incidentId,
      operator_id: operatorId,
    });
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
   * GET /operators/locations
   *
   * Returns operators with their current location info.
   * Used to build the operator list panel in the assignment modal.
   */
  getAvailableOperators(): Observable<AvailableOperator[]> {
    return this.httpService
      .get<{ operators: AvailableOperator[] }>('/operators/locations')
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
}
