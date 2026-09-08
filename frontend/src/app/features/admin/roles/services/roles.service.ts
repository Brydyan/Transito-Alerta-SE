import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import {
  RoleListItem,
  RoleStats,
  PermissionItem,
  RoleDetail,
  UpdateRolePayload,
} from '../models/role-permission.interface';

@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);
  private readonly rolesUrl = `${environment.apiUrl}/roles`;
  private readonly permissionsUrl = `${environment.apiUrl}/permissions`;
  private readonly statsUrl = `${environment.apiUrl}/roles/stats`;

  /**
   * GET /api/roles — lista paginada con búsqueda opcional.
   * F6 (`2026-09-08-f6-roles-redesign`).
   *
   * El backend puede responder con un array plano o un envelope
   * `{ data, meta }` — el `map` aplana a `RoleListItem[]`. La forma
   * de cada item se enriquece con `permissionCount` e `isSystemRole`
   * (backend lo devuelve como parte del rol en el wire shape).
   */
  getRoles(
    page: number = 1,
    limit: number = 25,
    search?: string,
  ): Observable<RoleListItem[]> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (search && search.trim().length > 0) {
      params = params.set('search', search.trim());
    }
    return this.http
      .get<RoleListItem[] | { data: RoleListItem[]; meta?: { total?: number } }>(
        this.rolesUrl,
        { params, withCredentials: true },
      )
      .pipe(
        map((res) => (Array.isArray(res) ? res : (res.data ?? []))),
      );
  }

  /**
   * GET /api/roles/stats — métricas agregadas para las 3 cards del
   * pie. Aplana envelope a un `RoleStats` (con fallback a ceros).
   */
  getRoleStats(): Observable<RoleStats> {
    return this.http
      .get<RoleStats | { data: RoleStats }>(this.statsUrl, { withCredentials: true })
      .pipe(
        map((res) => {
          const stats = (res && 'data' in res ? (res as { data: RoleStats }).data : (res as RoleStats)) ?? ({} as RoleStats);
          return {
            totalPermissions: stats.totalPermissions ?? 0,
            protectedModules: stats.protectedModules ?? 0,
            assignedUsers: stats.assignedUsers ?? 0,
          };
        }),
      );
  }

  /**
   * DELETE /api/roles/{id} — backend devuelve 204 No Content
   * usualmente. El 403 se traduce a un mensaje claro en el
   * componente (D7: sin `*hasPermission`).
   */
  deleteRole(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rolesUrl}/${id}`, { withCredentials: true });
  }

  getRoleById(id: number): Observable<RoleDetail> {
    return this.http
      .get<RoleDetail | { data: RoleDetail }>(`${this.rolesUrl}/${id}`, { withCredentials: true })
      .pipe(
        map((res) => {
          const detail = (
            res && typeof res === 'object' && 'data' in res ? res.data : res
          ) as RoleDetail;
          return {
            ...detail,
            permisos: Array.isArray(detail?.permisos) ? detail.permisos : [],
          };
        }),
      );
  }

  getAllPermissions(): Observable<PermissionItem[]> {
    return new Observable<PermissionItem[]>((subscriber) => {
      const all: PermissionItem[] = [];
      const fetchPage = (page: number) => {
        const params = new HttpParams().set('page', String(page)).set('limit', '100');
        this.http
          .get<
            | PermissionItem[]
            | { data: PermissionItem[]; meta?: { ultimaPagina?: number; total?: number } }
          >(this.permissionsUrl, { params, withCredentials: true })
          .subscribe({
            next: (res) => {
              let items: PermissionItem[] = [];
              let totalPages = 1;

              if (Array.isArray(res)) {
                items = res;
              } else if (res && typeof res === 'object') {
                items = Array.isArray(res.data) ? res.data : [];
                totalPages = res.meta?.ultimaPagina ?? 1;
              }

              all.push(...items);

              if (page < totalPages && items.length > 0) {
                fetchPage(page + 1);
              } else {
                subscriber.next(all);
                subscriber.complete();
              }
            },
            error: (err) => subscriber.error(err),
          });
      };

      fetchPage(1);
    });
  }

  updateRole(id: number, payload: UpdateRolePayload): Observable<RoleDetail> {
    return this.http.patch<RoleDetail>(`${this.rolesUrl}/${id}`, payload, {
      withCredentials: true,
    });
  }
}
