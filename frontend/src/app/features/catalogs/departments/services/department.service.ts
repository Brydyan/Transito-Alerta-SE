import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { HttpService } from '../../../../core/services/http.service';
import {
  ICreateDepartmentDto,
  IDeleteDepartmentResponse,
  IDepartment,
  IDepartmentListParams,
  IDepartmentListResult,
  IDepartmentFormData,
  IUpdateDepartmentDto,
} from '../interfaces/idepartment.interface';

const ENDPOINT = '/departments';

/**
 * DepartmentService (`front/2026-09-15-departments-menu`).
 *
 * Thin wrapper over `HttpService`. Same shape as
 * `IncidentCategoryService` so the call sites in `DepartmentListComponent`
 * / `DepartmentFormComponent` mirror the existing catalog pattern.
 *
 * No state, no caching: every call hits the network. The list endpoint
 * is the only one with the enriched `organization_name` / `user_count`
 * join (backend design D2). 0058 added `category_ids` to the enriched
 * row + a new `getFormData()` for the form's category checkbox list.
 */
@Injectable({ providedIn: 'root' })
export class DepartmentService {
  private readonly http = inject(HttpService);

  list(params: IDepartmentListParams = {}): Observable<IDepartmentListResult> {
    return this.http.get<IDepartmentListResult>(ENDPOINT, params);
  }

  /**
   * Detail endpoint returns `{ department, category_ids }`. Convenience
   * wrapper unwraps the envelope so the caller sees a flat `IDepartment`
   * with `category_ids` attached (the same shape the list returns).
   */
  getById(id: string): Observable<IDepartment> {
    return new Observable((subscriber) => {
      const sub = this.http
        .get<{ department: IDepartment; category_ids: string[] }>(
          `${ENDPOINT}/${id}`,
        )
        .subscribe({
          next: (envelope) =>
            subscriber.next({ ...envelope.department, category_ids: envelope.category_ids }),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      return () => sub.unsubscribe();
    });
  }

  create(dto: ICreateDepartmentDto): Observable<IDepartment> {
    return this.http.post<IDepartment>(ENDPOINT, dto);
  }

  update(id: string, dto: IUpdateDepartmentDto): Observable<IDepartment> {
    return this.http.patch<IDepartment>(`${ENDPOINT}/${id}`, dto);
  }

  /**
   * DELETE returns 200 with `{ id, deleted_at }` (D8). The frontend
   * uses `deleted_at` to render "Eliminado a las HH:MM" in the
   * confirm toast.
   */
  remove(id: string): Observable<IDeleteDepartmentResponse> {
    return this.http.delete<IDeleteDepartmentResponse>(`${ENDPOINT}/${id}`);
  }

  /**
   * 0058 — fetches the lookup data the form needs (currently just the
   * active incident categories). Cached for the lifetime of the
   * component instance via the standard Angular DI / HTTP layer; not
   * cached across navigations.
   */
  getFormData(): Observable<IDepartmentFormData> {
    return this.http.get<IDepartmentFormData>(`${ENDPOINT}/form-data`);
  }
}

