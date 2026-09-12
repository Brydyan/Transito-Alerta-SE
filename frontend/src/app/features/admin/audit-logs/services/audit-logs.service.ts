import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../../../environments/environment';

/**
 * Filtros opcionales que se mandan a `GET /api/audit-logs` y
 * `GET /api/audit-logs/export.csv`. Las claves camelCase mapean
 * a snake_case (`date_from`, `date_to`, `actor_id`) — ver
 * `apply-progress.md` para la convención completa.
 */
export interface AuditLogFilters {
  dateFrom?: string;
  dateTo?: string;
  actorId?: string;
}

/** Paginación explícita; el componente la lleva en signals. */
export interface AuditLogPagination {
  page: number;
  limit: number;
}

/** Item individual — `actor_name` es `null` si el user fue
 *  borrado (D4 del design back: LEFT JOIN users).
 *
 *  sdd-verify FIX-1 (CRITICAL): fields are snake_case to match
 *  the wire emitted by the global `SnakeCaseResponseInterceptor`.
 *  The back's `AuditLogItemDto` is camelCase; the interceptor
 *  rewrites it to snake_case on the wire. Reading camelCase
 *  here silently yields `undefined` for every field — same
 *  pitfall as SC-209 (`size_bytes` ≠ `file_size`). */
export interface AuditLogItem {
  id: string;
  actor_id: string;
  actor_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  justification: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Envelope paginado — coincide con el wire del back
 *  (`{items, total}`) tras pasar por `SnakeCaseResponseInterceptor`. */
export interface AuditLogsResponse {
  items: ReadonlyArray<AuditLogItem>;
  total: number;
}

/** Forma slim para el dropdown de actor — D2. */
export interface AuditLogActor {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * F6 (`2026-09-11-f6-audit-logs-export`) — HTTP service para
 * la pantalla de Auditoría de Acceso.
 *
 * Tres métodos:
 *
 *  - `getAuditLogs(filters, pagination)` — wrapper de
 *    `GET /api/audit-logs`. Devuelve `{items, total}`.
 *  - `exportCsv(filters)` — wrapper de
 *    `GET /api/audit-logs/export.csv` con `responseType: 'blob'`.
 *    **NUNCA** `window.open` ni `<a href="…api-url…">`: las
 *    cookies de auth sólo viajan con `HttpClient` (R4-S3).
 *  - `getUsers()` — wrapper de `GET /api/users?limit=100` para
 *    el dropdown de actores. D2 del design dice `form-data`,
 *    pero ese endpoint actual sólo trae `{roles, organizations}`
 *    — desviación documentada en `apply-progress.md`.
 *
 * SC-209 lesson (D-frontend-9 del F6 rediseño): los modelos
 * frontend derivan del wire snake_case (`actor_id`,
 * `actor_name`, `created_at`), no del nombre interno del DTO
 * back. El interceptor reescribe TODA respuesta a snake_case.
 */
@Injectable({
  providedIn: 'root',
})
export class AuditLogsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/audit-logs`;

  /** Construye los `HttpParams` con snake_case y omite los vacíos. */
  private toParams(
    filters: AuditLogFilters,
    pagination: AuditLogPagination,
  ): HttpParams {
    let params = new HttpParams()
      .set('page', pagination.page.toString())
      .set('limit', pagination.limit.toString());
    if (filters.dateFrom) params = params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params = params.set('date_to', filters.dateTo);
    if (filters.actorId) params = params.set('actor_id', filters.actorId);
    return params;
  }

  /** GET /api/audit-logs — lista paginada con filtros opcionales. */
  getAuditLogs(
    filters: AuditLogFilters,
    pagination: AuditLogPagination,
  ): Observable<AuditLogsResponse> {
    const params = this.toParams(filters, pagination);
    return this.http
      .get<{ items: AuditLogItem[]; total: number }>(this.baseUrl, {
        params,
        withCredentials: true,
      })
      .pipe(map((res) => ({ items: res.items ?? [], total: res.total ?? 0 })));
  }

  /** GET /api/audit-logs/export.csv — stream CSV autenticado.
   *  El handler del componente dispara la descarga vía
   *  `URL.createObjectURL` + `<a download>` (R4-S3). */
  exportCsv(filters: AuditLogFilters): Observable<Blob> {
    let params = new HttpParams();
    if (filters.dateFrom) params = params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params = params.set('date_to', filters.dateTo);
    if (filters.actorId) params = params.set('actor_id', filters.actorId);
    return this.http.get(`${this.baseUrl}/export.csv`, {
      params,
      withCredentials: true,
      responseType: 'blob',
    });
  }

  /** GET /api/users?limit=100 — dropdown de actores.
   *  Devolvemos una forma slim `{id, firstName, lastName}` que
   *  el componente mapea al label del `<select>`. Si el usuario
   *  no tiene `READ users`, el back devuelve 403 y el componente
   *  degrada al input UUID (D2). */
  getUsers(): Observable<ReadonlyArray<AuditLogActor>> {
    const params = new HttpParams().set('limit', '100');
    return this.http
      .get<{ items: { id: string; first_name?: string; last_name?: string }[]; total: number }>(
        `${environment.apiUrl}/users`,
        { params, withCredentials: true },
      )
      .pipe(
        map((res) =>
          (res.items ?? []).map((u) => ({
            id: u.id,
            firstName: u.first_name ?? '',
            lastName: u.last_name ?? '',
          })),
        ),
      );
  }
}
