import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { HttpService } from './http.service';
import {
  Incident,
  IncidentListFilters,
  IncidentListResult,
  CreateIncidentDto,
} from '../models/incident.model';

/**
 * F3 (sc-303) — F3.1.2 contract revalidation.
 *
 * Before this round, `getIncidents` accepted `filters?: any` and
 * `updateIncidentStatus(id, status: string)` lost type safety on
 * status. The contract assertion that SC-209's audit suggested
 * (D1: "afirmar sobre campos mapeados, no sobre la URL") drove the
 * rewrite: filters are typed, the URL is a derived projection of
 * the typed object, and the spec asserts on the wire shape, not
 * on the URL string.
 */
@Injectable({
  providedIn: 'root',
})
export class IncidentService {
  private readonly incidents$ = new BehaviorSubject<Incident[]>([]);

  constructor(private httpService: HttpService) {}

  /**
   * GET /api/incidents?search=&status=&priority=&page=&limit=&category_id=
   *
   * Backend returns a plain `Incident[]` today (no envelope). The
   * method wraps it in `IncidentListResult` so callers (the listing
   * page, F3.2) can switch to a paginated envelope later without
   * changing consumers — the projection lives in one place.
   */
  getIncidents(filters: IncidentListFilters = {}): Observable<IncidentListResult> {
    const params = this.toQueryParams(filters);
    return this.httpService
      .get<Incident[]>('/incidents', params)
      .pipe(
        map((items) => ({
          items,
          // F3 (sc-303) C1 (ronda 4) — el backend actual NO pagina;
          // devuelve hasta 1000 filas. `total` iguala `items.length`
          // porque la "página" es toda la respuesta. Cuando el
          // backend agregue paginación real (con `OFFSET`/`LIMIT`),
          // este campo viene del header `X-Total-Count` o de un
          // envelope. Mientras tanto, el paginador del frontend
          // se oculta (ver `IncidentListComponent.shouldShowPagination`).
          total: items.length,
          page: 1,
          limit: items.length,
        })),
        tap((result) => this.incidents$.next(result.items)),
      );
  }

  getIncident(id: string): Observable<Incident> {
    return this.httpService.get<Incident>(`/incidents/${id}`);
  }

  createIncident(dto: CreateIncidentDto): Observable<Incident> {
    return this.httpService.post<Incident>('/incidents', dto).pipe(
      tap((incident) => {
        const current = this.incidents$.value;
        this.incidents$.next([incident, ...current]);
      }),
    );
  }

  /**
   * PATCH /api/incidents/:id/status — body `{ status, closed_reason? }`.
   * The backend now enforces the machine via
   * `IncidentWorkflowService.changeStatus()` (sc-315): invalid
   * transitions return 409, missing closed_reason on a `closed`
   * target returns 422, missing CLOSE incidents returns 403.
   */
  updateIncidentStatus(
    id: string,
    status: Incident['status'],
    closed_reason?: string,
  ): Observable<Incident> {
    const body: { status: Incident['status']; closed_reason?: string } = { status };
    if (closed_reason !== undefined) {
      body.closed_reason = closed_reason;
    }
    return this.httpService.patch<Incident>(`/incidents/${id}/status`, body).pipe(
      tap((incident) => {
        const current = this.incidents$.value.map((inc) =>
          inc.id === id ? incident : inc,
        );
        this.incidents$.next(current);
      }),
    );
  }

  deleteIncident(id: string): Observable<void> {
    return this.httpService.delete<void>(`/incidents/${id}`).pipe(
      tap(() => {
        const current = this.incidents$.value.filter((inc) => inc.id !== id);
        this.incidents$.next(current);
      }),
    );
  }

  /**
   * POST /api/incidents/:id/release — libera la incidencia que el
   * caller tiene reclamada. El backend (`IncidentWorkflowService.release`)
   * exige que el caller sea el `claimed_by` actual, y devuelve 409
   * `INCIDENT_NOT_CLAIMED` / `NOT_THE_CLAIMER` si no se cumple.
   *
   * F3 (sc-303) C2 (ronda 4): el botón "release" del detail estaba
   * como no-op silencioso. Conectar al endpoint real.
   */
  releaseIncident(id: string): Observable<Incident> {
    return this.httpService
      .post<Incident>(`/incidents/${id}/release`, {})
      .pipe(
        tap((released) => {
          const current = this.incidents$.value.map((inc) =>
            inc.id === id ? released : inc,
          );
          this.incidents$.next(current);
        }),
      );
  }

  getIncidents$(): Observable<Incident[]> {
    return this.incidents$.asObservable();
  }

  /**
   * F3.1.3 / F3.2.3 (D2) — typed filter object → URLSearchParams.
   * The frontend never constructs a URL string manually; the
   * spec asserts on the returned `HttpParams` (stable across
   * test runs, not order-sensitive in practice because each
   * key is added in one place).
   *
   * F3 (sc-303) C1 (ronda 4) — el backend `incidents.controller.ts:findAll`
   * sólo acepta `zone_id` y `status`. Los demás campos (search,
   * priority, page, limit, category_id) se quitan de la URL
   * hasta que un change de backend los soporte. No enviarlos
   * en silencio es la decisión honesta: un query string con
   * params que el servidor ignora es un bug de perf sin
   * síntoma visible (el usuario "ve" todos los resultados
   * cuando esperaba filtrados, y la causa no es evidente).
   */
  private toQueryParams(filters: IncidentListFilters): Record<string, string> {
    const out: Record<string, string> = {};
    if (filters.status) {
      out['status'] = filters.status;
    }
    return out;
  }
}
