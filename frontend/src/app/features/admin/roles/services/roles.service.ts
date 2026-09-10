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
      .get<any[] | { data: any[] }>(this.rolesUrl, { params, withCredentials: true })
      .pipe(
        map((res) => {
          const roles = Array.isArray(res) ? res : res?.data ?? [];
          return roles.map((r: any) => ({
            rolId: r.id,
            nombre: r.name,
            permissionCount: r.permissions?.length ?? 0,
            isSystemRole: r.name && ['master', 'operador_sistema'].includes(r.name),
          }));
        })
      );
  }

  /**
   * GET /api/roles/stats — métricas agregadas para las 3 cards del
   * pie. Aplana envelope a un `RoleStats` (con fallback a ceros).
   *
   * SC-209 lesson (D-frontend-9, F6 rediseño): la respuesta del
   * backend es snake_case (`total_permissions` etc.) por el
   * `SnakeCaseResponseInterceptor` global. El `map` debe leer los
   * campos snake_case, no los camelCase del `RoleStats` — si
   * los lee del shape camelCase, los campos quedan `undefined`
   * y el `?? 0` degrada a ceros sin que la request falle.
   */
  getRoleStats(): Observable<RoleStats> {
    return this.http
      .get<{ data?: { total_permissions?: number; protected_modules?: number; assigned_users?: number } }>(
        this.statsUrl,
        { withCredentials: true },
      )
      .pipe(
        map((res) => {
          // El backend puede envolver en `{ data: ... }` (paginación,
          // convención del proyecto) o devolver el objeto plano. Ambos
          // campos vienen en snake_case.
          const inner = res && 'data' in res && res.data ? res.data : (res as unknown as {
            total_permissions?: number;
            protected_modules?: number;
            assigned_users?: number;
          });
          return {
            totalPermissions: inner?.total_permissions ?? 0,
            protectedModules: inner?.protected_modules ?? 0,
            assignedUsers: inner?.assigned_users ?? 0,
          };
        }),
      );
  }

  /**
   * DELETE /api/roles/{id} — backend devuelve 204 No Content
   * usualmente. El 403 se traduce a un mensaje claro en el
   * componente (D7: sin `*hasPermission`).
   */
  deleteRole(id: string | number): Observable<void> {
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
