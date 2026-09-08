import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import {
  PaginatedUsersResponse,
  User,
  UserDetail,
  Role,
  RoleDetail,
  PermissionItem,
  CreateUserPayload,
  UpdateUserPayload,
  Organization,
} from '../models/user.interface';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly usersUrl = `${environment.apiUrl}/users`;
  private readonly rolesUrl = `${environment.apiUrl}/roles`;
  private readonly permissionsUrl = `${environment.apiUrl}/permissions`;
  private readonly organizationsUrl = `${environment.apiUrl}/organizations`;

  /**
   * F6 fix batch (`fixes-required.md` C.2) — `role`/`org` viajan como
   * query params opcionales para que el backend pueda filtrar server-side
   * en cuanto `GET /users` los soporte (hoy el endpoint sólo lee
   * `page`/`limit`; los params extra se ignoran sin romper la request).
   */
  getUsers(page = 1, limit = 10, role?: string, org?: string): Observable<PaginatedUsersResponse> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (role) params = params.set('role', role);
    if (org) params = params.set('org', org);
    return this.http
      .get<{ items: any[]; total: number }>(this.usersUrl, { params, withCredentials: true })
      .pipe(
        map((res) => ({
          data: res.items.map((item) => ({
            usuarioId: item.id,
            email: item.email,
            nombres: item.first_name || '',
            apellidos: item.last_name || '',
            telefono: item.phone || '',
            avatar: null,
            rol: item.role ? { rolId: item.role_id, nombre: item.role } : null,
            organizationId: item.organization_id,
          })),
          meta: {
            total: res.total,
            page,
            limit,
            ultimaPagina: Math.ceil(res.total / limit),
            paginaActual: page,
            porPagina: limit,
            anterior: page > 1 ? page - 1 : null,
            siguiente: page < Math.ceil(res.total / limit) ? page + 1 : null,
          },
        }))
      );
  }

  getUserById(id: number): Observable<UserDetail> {
    return this.http.get<UserDetail>(`${this.usersUrl}/${id}`, { withCredentials: true });
  }

  /**
   * Actualiza el perfil del usuario autenticado (incluyendo avatar opcional).
   */
  updateMe(payload: UpdateUserPayload, file?: File): Observable<UserDetail> {
    const formData = new FormData();
    Object.keys(payload).forEach((key) => {
      const value = payload[key as keyof typeof payload];
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });

    if (file) {
      formData.append('file', file);
    }

    return this.http.patch<UserDetail>(`${this.usersUrl}/me`, formData, { withCredentials: true });
  }

  createUser(payload: CreateUserPayload, file?: File): Observable<User> {
    const formData = new FormData();
    Object.keys(payload).forEach((key) => {
      const value = payload[key as keyof typeof payload];
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });

    if (file) {
      formData.append('file', file);
    }

    return this.http.post<User>(this.usersUrl, formData, { withCredentials: true });
  }

  updateUser(id: number, payload: UpdateUserPayload, file?: File): Observable<User> {
    const formData = new FormData();
    Object.keys(payload).forEach((key) => {
      const value = payload[key as keyof typeof payload];
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });

    if (file) {
      formData.append('file', file);
    }

    return this.http.patch<User>(`${this.usersUrl}/${id}`, formData, { withCredentials: true });
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.usersUrl}/${id}`, { withCredentials: true });
  }

  getRoles(): Observable<Role[]> {
    return this.http
      .get<any[]>(this.rolesUrl, { withCredentials: true })
      .pipe(
        map((res) => {
          const roles = Array.isArray(res) ? res : res?.data ?? [];
          return roles.map((r) => ({
            rolId: r.id,
            nombre: r.name,
          }));
        })
      );
  }

  /**
   * GET /api/organizations — devuelve la lista plana de
   * organizaciones activas para el dropdown de filtro. F6
   * (`2026-09-08-f6-usuarios-redesign`).
   *
   * El backend expone un envelope `{ data, meta }`; el `map`
   * aplana a `Organization[]` para que el componente no tenga
   * que conocer el envelope.
   */
  getOrganizations(): Observable<Organization[]> {
    return this.http
      .get<Organization[] | { data: Organization[] }>(this.organizationsUrl, {
        withCredentials: true,
      })
      .pipe(map((res) => (Array.isArray(res) ? res : (res.data ?? []))));
  }

  getRoleById(id: number): Observable<RoleDetail> {
    return this.http.get<RoleDetail>(`${this.rolesUrl}/${id}`, { withCredentials: true });
  }

  getPermissions(): Observable<PermissionItem[] | { data: PermissionItem[] }> {
    const params = new HttpParams().set('limit', '100');
    return this.http.get<PermissionItem[] | { data: PermissionItem[] }>(this.permissionsUrl, {
      params,
      withCredentials: true,
    });
  }
}
