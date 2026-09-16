import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { HttpService } from '../../../../core/services/http.service';
import {
  ICreateDepartmentDto,
  IDeleteDepartmentResponse,
  IDepartment,
  IDepartmentListParams,
  IDepartmentListResult,
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
 * join (backend design D2); the per-id endpoint returns the plain row.
 */
@Injectable({ providedIn: 'root' })
export class DepartmentService {
  private readonly http = inject(HttpService);

  list(params: IDepartmentListParams = {}): Observable<IDepartmentListResult> {
    return this.http.get<IDepartmentListResult>(ENDPOINT, params);
  }

  getById(id: string): Observable<IDepartment> {
    return this.http.get<IDepartment>(`${ENDPOINT}/${id}`);
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
}
