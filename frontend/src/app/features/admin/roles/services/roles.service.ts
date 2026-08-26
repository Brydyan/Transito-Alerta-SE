import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import {
  RoleListItem,
  PermissionItem,
  RoleDetail,
  UpdateRolePayload,
} from '../models/role-permission.interface';

@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);
  private readonly rolesUrl = `${environment.apiUrl}/roles`;
  private readonly permissionsUrl = `${environment.apiUrl}/permissions`;

  getRoles(): Observable<RoleListItem[]> {
    return this.http.get<RoleListItem[]>(this.rolesUrl, { withCredentials: true });
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
