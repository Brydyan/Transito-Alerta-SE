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
} from '../models/user.interface';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly usersUrl = `${environment.apiUrl}/users`;
  private readonly rolesUrl = `${environment.apiUrl}/roles`;
  private readonly permissionsUrl = `${environment.apiUrl}/permissions`;

  getUsers(page = 1, limit = 10): Observable<PaginatedUsersResponse> {
    const params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<PaginatedUsersResponse>(this.usersUrl, { params, withCredentials: true });
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
      .get<Role[] | { data: Role[] }>(this.rolesUrl, { withCredentials: true })
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
