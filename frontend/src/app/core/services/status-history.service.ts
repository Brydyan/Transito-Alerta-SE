import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { BehaviorSubject } from 'rxjs';
import { HttpService } from './http.service';
import {
  StatusHistoryEntry,
  StatusHistoryListResult,
} from '../models/status-history.model';

/**
 * F3 (sc-303) — F3.1.6 status-history service.
 *
 * One read path: `GET /incidents/:incidentId/status-history` (the
 * resource is a sub-resource of incidents, so the URL is nested —
 * the backend's `inferResourceFromPath` would otherwise infer
 * `incidents` and reopen the audit trail to every `READ incidents`
 * holder; the controller declares the override explicitly).
 *
 * The service carries a per-incident cache (BehaviorSubject) so
 * the detail page can re-render the timeline as the user reloads
 * it without a server round-trip if the same incident is opened
 * twice in a session.
 */
@Injectable({
  providedIn: 'root',
})
export class StatusHistoryService {
  // Cache: incidentId → entries. Simpler than a Map observable; the
  // F3 detail page consumes it through a synchronous getter, not
  // an observable, so it doesn't need a stream.
  private cache = new Map<string, StatusHistoryEntry[]>();

  constructor(private httpService: HttpService) {}

  /**
   * GET /incidents/:incidentId/status-history
   * Returns `{ items, total }` per the backend's envelope.
   */
  getStatusHistory(incidentId: string): Observable<StatusHistoryListResult> {
    return this.httpService
      .get<StatusHistoryListResult>(`/incidents/${incidentId}/status-history`)
      .pipe(
        tap((result) => {
          this.cache.set(incidentId, result.items);
        }),
      );
  }

  /**
   * Synchronous cache accessor. Returns `null` if the incident's
   * history has not been fetched yet — callers should fall back to
   * `getStatusHistory()` for the first load.
   */
  getCached(incidentId: string): StatusHistoryEntry[] | null {
    return this.cache.get(incidentId) ?? null;
  }

  /**
   * Drop a single incident from the cache. Useful on logout or
   * when the user navigates away from the detail page.
   */
  invalidate(incidentId: string): void {
    this.cache.delete(incidentId);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
