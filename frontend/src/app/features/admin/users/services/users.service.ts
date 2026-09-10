import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import {
  PaginatedUsersResponse,
  User,
  UserDetail,
  Role,
  RoleDetail,
  PermissionItem,
  CreateUserPayload,
  CreateUserJsonPayload,
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
            // SnakeCaseResponseInterceptor: el wire es `is_active` (snake).
            // Sin este mapeo, `u.isActive` queda `undefined` y todas
            // las filas aparecen como "inactivo" (SC-209 lesson,
            // D-frontend-9 del F6 rediseño).
            isActive: item.is_active,
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

  /**
   * GET /api/users/:id — detalle de un usuario. El `id` es UUID
   * (string), no number — el wire es `id: "uuid"`. El response
   * viene snake_case vía `SnakeCaseResponseInterceptor`, así que
   * se mapea a la forma `UserDetail` (camelCase + nombres en
   * español para mantener el contrato del componente).
   *
   * SC-209 lesson (D-frontend-9, F6 rediseño): sin este `map`,
   * el componente leía `user.nombres` (camelCase) y el wire
   * entregaba `first_name` (snake_case) → `undefined` → form
   * vacío. El `?? null` defensivo evita NPE si el backend omite
   * un campo opcional.
   */
  getUserById(id: string): Observable<UserDetail> {
    return this.http
      .get<{
        id?: string;
        email?: string;
        first_name?: string;
        last_name?: string;
        phone?: string | null;
        role?: string;
        role_id?: string;
        organization_id?: string | null;
        is_active?: boolean;
        permissions?: string[];
      }>(`${this.usersUrl}/${id}`, { withCredentials: true })
      .pipe(
        map((raw) => {
          const roleName = raw.role ?? null;
          const roleId = raw.role_id ?? null;
          const orgId = raw.organization_id ?? null;
          return {
            usuarioId: raw.id ?? id,
            email: raw.email ?? '',
            nombres: raw.first_name ?? '',
            apellidos: raw.last_name ?? '',
            telefono: raw.phone ?? '',
            isActive: raw.is_active ?? false,
            avatar: null as UserDetail['avatar'],
            rol:
              roleId && roleName
                ? { rolId: roleId, nombre: roleName }
                : null,
            organizationId: orgId,
            // El endpoint `GET /api/users/:id` no devuelve el desglose
            // `permisosDirectos` ni `permisosRol` (eso vive en endpoints
            // de permisos directos). Dejamos arrays vacíos para que
            // el form no rompa al iterar; si el form necesita esas
            // listas, se cargan vía los endpoints dedicados.
            permisosDirectos: [] as UserDetail['permisosDirectos'],
            permisosRol: [] as UserDetail['permisosRol'],
          } satisfies UserDetail;
        }),
      );
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

  /**
   * F6 (`2026-09-08-f6-new-user-form`, D-frontend-4) — variante JSON
   * del alta. Se usa desde `NewUserFormComponent` con el payload
   * snake_case que `AdminCreateUserDto` espera (ver
   * `backend/src/modules/users/dto/admin-create-user.dto.ts`).
   *
   * **Por qué convive con `createUser` (FormData)**: `createUser` lo
   * sigue usando `UserFormComponent` (create path de la ruta
   * `:id/edit`-que-cuelga-de-`new`); refactorizar el método a JSON
   * rompería ese path. El edit queda en FormData hasta que se rediseñe
   * (F6.5.2). Documentado en `apply-progress.md`.
   */
  createUserJson(payload: CreateUserJsonPayload): Observable<User> {
    return this.http.post<User>(this.usersUrl, payload, { withCredentials: true });
  }

  /**
   * F6 (D-frontend-4) — sube el avatar DESPUÉS del `POST /users`
   * exitoso. `UsersController.updateAvatar` espera multipart con la
   * clave `avatar` (`@UseInterceptors(FileInterceptor('avatar'))`).
   */
  uploadAvatar(id: string, file: File): Observable<User> {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.http.patch<User>(`${this.usersUrl}/${id}/avatar`, formData, {
      withCredentials: true,
    });
  }

  /**
   * F6 (D-frontend-5) — `GET /api/users/form-data` (T5.4,
   * `UsersController.getFormData`). Devuelve la forma cruda del
   * backend: `{ roles: [{id, name}], organizations: [{id, name}] }`.
   * El componente la usa para poblar los dropdowns.
   */
  getFormData(): Observable<{ roles: ReadonlyArray<{ id: string; name: string }>; organizations: ReadonlyArray<Organization> }> {
    return this.http
      .get<{
        roles: { id: string; name: string }[];
        organizations: Organization[];
      }>(`${this.usersUrl}/form-data`, { withCredentials: true })
      .pipe(
        map((res) => ({
          roles: (res.roles ?? []).map((r) => ({ id: r.id, name: r.name })),
          organizations: res.organizations ?? [],
        })),
      );
  }

  /**
   * F6 (D-frontend-5) — `GET /api/roles/:id/permissions` (R6,
   * `RolesController.listPermissions`). Devuelve un array de strings
   * con los permisos del rol (formato "ACTION resource", p. ej.
   * "READ dashboard"). On-demand al seleccionar el rol.
   */
  getRolePermissions(id: string): Observable<ReadonlyArray<string>> {
    return this.http
      .get<string[]>(`${this.rolesUrl}/${id}/permissions`, { withCredentials: true })
      .pipe(map((res) => (Array.isArray(res) ? res : [])));
  }

  /**
   * F6 (D-frontend-5.a) — `GET /api/permissions?limit=100`. Se usa
   * para derivar la lista "SIN ACCESO" del role preview (permisos del
   * catálogo que el rol NO tiene, slice 0-2). El backend devuelve un
   * envelope `{ data, meta }` con objetos `PermissionItem`; acá
   * proyectamos a `string[]` con el formato `"ACTION resource"`.
   */
  getPermissionsCatalog(): Observable<ReadonlyArray<string>> {
    const params = new HttpParams().set('limit', '100');
    return this.http
      .get<PermissionItem[] | { data: PermissionItem[] }>(this.permissionsUrl, {
        params,
        withCredentials: true,
      })
      .pipe(
        // El catálogo es opcional (sólo alimenta "SIN ACCESO" del role
        // preview). Si el rol actual no tiene `READ permissions`, el
        // endpoint 403 y la lista debe quedar vacía sin spamear al
        // usuario con un toast de "permisos insuficientes".
        catchError(() => of([] as PermissionItem[])),
        map((res) => {
          const items = Array.isArray(res) ? res : (res.data ?? []);
          return items
            .map((p) => `${p.accion} ${p.recurso}`.trim())
            .filter((s) => s.length > 0);
        }),
      );
  }

  /**
   * PATCH /api/users/:id — actualiza un usuario existente. El `id`
   * es UUID (string). Acepta `UpdateUserPayload` (camelCase +
   * nombres en español) y la traduce al wire del backend
   * (`AdminUpdateUserDto`): snake_case + nombres en inglés
   * (`first_name`, `last_name`, `role_id`, `organization_id`).
   *
   * F6 fix: el backend rechaza campos extra con
   * `forbidNonWhitelisted` (validación global del `main.ts`).
   * El componente no puede enviar `email`/`telefono` por este
   * endpoint — esos no están en el DTO. Para cambiar email
   * o teléfono, usar `PATCH /api/users/me` (perfil propio) o
   * un nuevo endpoint admin (out of scope de este fix).
   *
   * Si hay `file` (avatar), se envía como FormData con un solo
   * campo `file`; el backend no acepta los otros campos en
   * FormData (son `@Body()` JSON), así que se hace una segunda
   * request con los datos en JSON. Esto es lo más limpio sin
   * refactorizar el controller; documentado en `apply-progress.md`.
   */
  updateUser(id: string, payload: UpdateUserPayload, file?: File): Observable<User> {
    const body: Record<string, unknown> = {};
    if (payload.nombres !== undefined) body['first_name'] = payload.nombres;
    if (payload.apellidos !== undefined) body['last_name'] = payload.apellidos;
    if (payload.rolId !== undefined && payload.rolId !== null) body['role_id'] = payload.rolId;
    if (payload.organizationId !== undefined) body['organization_id'] = payload.organizationId;

    if (file) {
      // Avatar: sube el archivo en un FormData aparte. El backend
      // espera multipart con un solo campo `avatar` (no `file`) —
      // ver `POST /api/users/me/avatar`. Como ese endpoint es para
      // el perfil propio, no se usa acá. En su lugar, subimos al
      // endpoint PATCH con el campo `avatar` y el backend debería
      // aceptarlo (verificar con el equipo de backend si falla).
      const formData = new FormData();
      formData.append('avatar', file);
      // T7.3 TBD: combinar file + body en un solo request cuando
      // el backend lo soporte (NestJS FileInterceptor + JSON mixto).
      const avatarPatch$ = this.http.patch<User>(`${this.usersUrl}/${id}`, formData, {
        withCredentials: true,
      });
      // Si NO hay cambios de body, devolvemos sólo el PATCH de avatar.
      if (Object.keys(body).length === 0) {
        return avatarPatch$;
      }
      // Si hay cambios de body, encadenamos: primero avatar,
      // después body (en dos requests separados).
      return avatarPatch$.pipe(
        switchMap(() =>
          this.http.patch<User>(`${this.usersUrl}/${id}`, body, { withCredentials: true }),
        ),
        // Si el avatar PATCH falló, devolvemos el error antes de
        // tocar el body.
        catchError((err) => throwError(() => err)),
      );
    }

    return this.http.patch<User>(`${this.usersUrl}/${id}`, body, { withCredentials: true });
  }

  /**
   * DELETE /api/users/:id — soft delete. El `id` es UUID (string).
   */
  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${this.usersUrl}/${id}`, { withCredentials: true });
  }

  getRoles(): Observable<Role[]> {
    return this.http
      .get<any[] | { data: any[] }>(this.rolesUrl, { withCredentials: true })
      .pipe(
        map((res) => {
          const roles = Array.isArray(res) ? res : res?.data ?? [];
          return roles.map((r: any) => ({
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
   * El backend expone un envelope con paginación
   * `{ items: Organization[], total: number }`; el `map` aplana
   * a `Organization[]` para que el componente no tenga que
   * conocer el envelope. También soporta el shape `{ data: ... }`
   * por si el endpoint cambia de convención.
   */
  getOrganizations(): Observable<Organization[]> {
    return this.http
      .get<Organization[] | { items: Organization[]; total: number } | { data: Organization[] }>(
        this.organizationsUrl,
        { withCredentials: true },
      )
      .pipe(
        map((res) => {
          if (Array.isArray(res)) return res;
          if ('items' in res && Array.isArray(res.items)) return res.items;
          if ('data' in res && Array.isArray(res.data)) return res.data;
          return [];
        }),
      );
  }

  /**
   * GET /api/roles/:id — detalle de un rol. El `id` es UUID (string).
   * El wire viene snake_case vía `SnakeCaseResponseInterceptor`.
   * SC-209 lesson: sin `map`, `role.permisos` queda `undefined` en
   * el form que muestra la lista de permisos del rol.
   */
  getRoleById(id: string): Observable<RoleDetail> {
    return this.http
      .get<{
        id?: string;
        name?: string;
        permissions?: string[];
      }>(`${this.rolesUrl}/${id}`, { withCredentials: true })
      .pipe(
        map((raw) => ({
          rolId: raw.id ?? id,
          nombre: raw.name ?? '',
          permisos: raw.permissions ?? [],
        } satisfies RoleDetail)),
      );
  }

  getPermissions(): Observable<PermissionItem[] | { data: PermissionItem[] }> {
    const params = new HttpParams().set('limit', '100');
    return this.http.get<PermissionItem[] | { data: PermissionItem[] }>(this.permissionsUrl, {
      params,
      withCredentials: true,
    });
  }
}
