import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/**
 * UserProfile — shape devuelta por `GET /users/me` y `PATCH /users/me`
 * (`backend/src/modules/users/users.controller.ts`). El backend
 * serializa el `UserEntity` (columnas camelCase en TypeORM) a
 * snake_case vía `SnakeCaseResponseInterceptor` (global, `main.ts`),
 * así que el wire contract usa `first_name`/`last_name`/`avatar_url`,
 * no los nombres de columna de TypeORM.
 */
export interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  updated_at: string;
}

/** Payload de `PATCH /users/me` — matchea `UpdateProfileDto` (backend). */
export interface UpdateProfilePayload {
  first_name?: string;
  last_name?: string;
  phone?: string;
}

/**
 * UserService — self-service de perfil (`/users/me*`).
 *
 * `openspec/changes/front/2026-09-08-f6-perfil-redesign/fixes-required.md`
 * C.2.1: dedicado y separado de `UsersService`
 * (`features/admin/users/services/users.service.ts`, CRUD admin de
 * `/users/:id`) porque los DTOs son incompatibles:
 *  - `/users/me` (PATCH) espera JSON `{first_name, last_name, phone}`
 *    (`UpdateProfileDto`) — no el `{nombres, apellidos, telefono}` en
 *    español ni el multipart que usa el admin.
 *  - `/users/me/avatar` (POST) espera multipart con campo `avatar`
 *    (`FileInterceptor('avatar')`) — el admin usa el campo `file` en
 *    `/users/:id`, un endpoint distinto.
 *  - `/users/me` (GET) no requiere permiso (self, `UsersController.me`);
 *    `/users/:id` es admin-only (`@RequirePermission('READ')`) y
 *    devuelve 403 para un usuario no-admin consultando su propio perfil.
 *
 * Reusar `UsersService` para el perfil propio causaba los CRITICAL
 * C.1–C.4 de ese documento.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/users`;

  /** `GET /users/me` — perfil del usuario autenticado, sin guard de permiso. */
  getCurrentUser(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.baseUrl}/me`, { withCredentials: true });
  }

  /** `PATCH /users/me` — JSON (no multipart); campos en inglés/snake_case. */
  updateProfile(payload: UpdateProfilePayload): Observable<UserProfile> {
    return this.http.patch<UserProfile>(`${this.baseUrl}/me`, payload, {
      withCredentials: true,
    });
  }

  /**
   * `POST /users/me/avatar` — multipart, campo `avatar` (no `file`;
   * ese nombre es del endpoint admin `/users/:id`).
   */
  uploadProfileImage(file: File): Observable<UserProfile> {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.http.post<UserProfile>(`${this.baseUrl}/me/avatar`, formData, {
      withCredentials: true,
    });
  }
}
