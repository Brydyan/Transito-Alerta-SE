import { PaginatedMeta, PaginatedResponse } from '../../../../shared/models/paginated-response';
import { Avatar } from '../../../../core/models/auth.model';

export type { Avatar };

export interface Role {
  // F6 fix: `rolId` es UUID (string) — el backend devuelve
  // `id: "uuid"`. Antes era `number`, no matcheaba con el wire.
  rolId: string;
  nombre: string;
}

export interface RolePermission {
  rolPermisoId: string;
  permisoId: string;
  nombre: string;
  descripcion: string;
  recurso: string;
  accion: string;
}

/**
 * F6 fix: `permisos` es `string[]` (el wire real del backend es
 * `permissions: string[]` desde `GET /api/roles/:id`). Antes
 * estaba tipado como `RolePermission[]` con campos estructurados
 * (`permisoId, nombre, recurso, accion, …`) que el backend NO
 * devuelve — el template sólo necesita contar los permisos y el
 * form los itera como strings. Mantener la forma vieja hacía
 * que el `map` del service no encajara con el tipo y el código
 * no compilara.
 */
export interface RoleDetail extends Role {
  permisos: string[];
}

export interface PermissionItem {
  // F6 fix: `permisoId` ahora es `string` (UUID) — el backend
  // `GET /api/permissions` devuelve `id: "uuid"`. El type
  // legacy `number` no matcheaba con el wire y los `Set<number>`
  // del form siempre quedaban vacíos.
  permisoId: string;
  nombre: string;
  descripcion: string;
  recurso: string;
  accion: string;
}

export interface DirectPermission {
  usuarioPermisoId: string;
  permisoId: string;
  recurso: string;
  accion: string;
  permitido: boolean;
}

export interface User {
  // F6 fix: `usuarioId` es UUID (string), no number. El backend
  // devuelve `id: "uuid"` (no `id: number`). El type legacy
  // `number` rompía: `deleteUser(user.usuarioId)` mandaba el
  // id como number al PATCH/DELETE, y el backend buscaba un
  // usuario por id numérico (no encontrado) → 404 silencioso.
  usuarioId: string;
  email: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  avatar?: Avatar | null;
  rol: Role | null;
  /**
   * F6 fix batch (`fixes-required.md` C.1) — id de la organización a la
   * que pertenece el usuario. Resuelto contra el signal `organizations()`
   * (poblado por `UsersService.getOrganizations()`) para mostrar el
   * nombre en la columna «Organización» de la tabla. Opcional: el
   * backend puede omitirlo o devolver `null` para usuarios sin
   * organización asignada.
   */
  organizationId?: string | null;
  /**
   * F6 (`2026-09-08-f6-new-user-form`) — estado activo/inactivo del
   * usuario. Mapeado desde `is_active: boolean` del backend en
   * `users.service.ts:getUsers()` (el wire es snake_case vía
   * `SnakeCaseResponseInterceptor`). SC-209 lesson: si la
   * `User` interface no declara este campo, el componente lo
   * lee como `undefined` y `toUserStatus(undefined)` cae a
   * `'inactivo'` para todos. Se agrega explícitamente para
   * que la columna ESTADO de la tabla refleje datos reales.
   */
  isActive?: boolean;
}

export interface UserDetail extends User {
  permisosDirectos: DirectPermission[];
  permisosRol: { recurso: string; accion: string }[];
}

export type PaginatedUsersMeta = PaginatedMeta;
export type PaginatedUsersResponse = PaginatedResponse<User>;

export interface CreateUserPayload {
  email: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  // F6 fix: `rolId` es UUID (string), no number. Y agregamos
  // `organizationId` para que `createUser` pueda setear la org
  // al crear (el F6 new-user-form lo usa).
  rolId?: string;
  organizationId?: string | null;
  avatar?: Avatar;
}

/**
 * F6 (`2026-09-08-f6-usuarios-redesign` + fix del UserFormComponent):
 * `rolId` y `permisoId` eran `number` (legacy), ahora son `string`
 * (UUID) porque el backend usa UUIDs. `organizationId` se agrega
 * porque el form de edición tiene un selector de org (pre-existente
 * faltaba y hacía que el user se editara sin poder cambiar/cambiarle
 * la organización).
 *
 * F6 fix 2: `email` y `telefono` (renombrado a `phone` en el wire
 * del backend) ya estaban en el interface pero el DTO del backend
 * no los aceptaba y el form no los podía cambiar vía admin. Ahora
 * el admin puede editar ambos (master u operador_sistema con
 * `UPDATE users` permission). El backend valida formato y
 * unicidad del email.
 */
export interface UpdateUserPayload {
  email?: string;
  nombres?: string;
  apellidos?: string;
  telefono?: string;
  rolId?: string;
  organizationId?: string | null;
  avatar?: Avatar;
  directPermissions?: { permisoId: string; permitido: boolean }[];
}

/**
 * F6 (`2026-09-08-f6-usuarios-redesign`) — organización
 * mínima para el dropdown de filtro. El backend
 * (`/api/organizations`) devuelve un envelope `{ data, meta }`;
 * acá proyectamos sólo lo que el filtro necesita.
 */
export interface Organization {
  readonly id: string;
  readonly nombre: string;
}

/**
 * F6 (`2026-09-08-f6-usuarios-redesign`) — proyección de
 * `User` para la grilla. La columna de estado del mock 03-01
 * ('Activo'/'Pendiente'/'Inactivo') se mapea desde
 * `is_active: boolean` del backend: `true` ⇒ `activo`,
 * `false` ⇒ `inactivo`. La etiqueta `pendiente` existe en el
 * mock pero el backend actual no modela el estado intermedio
 * — ver apply-progress del change para la desviación.
 */
export type UserStatus = 'activo' | 'inactivo';

export function toUserStatus(isActive: boolean | null | undefined): UserStatus {
  return isActive ? 'activo' : 'inactivo';
}

// =====================================================================
// F6 — `2026-09-08-f6-new-user-form` (admin user creation form)
// =====================================================================

/**
 * F6 (D-frontend-3) — estado interno del `NewUserFormComponent`.
 * Mantenido como un único `signal<NewUserFormData>` (no `FormGroup`).
 *
 * Los campos `initialStatus` y `notificationChannel` son **fijos hasta
 * F7** (D-frontend-9) — se modelan en el estado para que el template
 * pueda atarlos sin filtraciones, pero el submit no los envía.
 */
export interface NewUserFormData {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  organizationId: string | null;
  roleId: string | null;
  sendInvitation: boolean;
  initialStatus: 'activo';
  notificationChannel: 'email';
}

/**
 * Defaults que el componente usa en `signal<NewUserFormData>(DEFAULT_NEW_USER_FORM)`.
 * Coinciden con D-frontend-9 (`sendInvitation: true` por defecto).
 */
export const DEFAULT_NEW_USER_FORM: NewUserFormData = {
  email: '',
  firstName: '',
  lastName: '',
  phone: '',
  organizationId: null,
  roleId: null,
  sendInvitation: true,
  initialStatus: 'activo',
  notificationChannel: 'email',
};

/**
 * F6 (D-frontend-5) — opción de rol en el dropdown. `id` es UUID
 * (matches `RoleEntity.id`); `name` viene de la columna `roles.name`
 * y se usa para las reglas "admin_org/operador_org requieren org".
 * `permissions` se carga on-demand (no upfront) — ver
 * `UsersService.getRolePermissions()`.
 */
export interface RoleOption {
  readonly id: string;
  readonly name: string;
  readonly permissions?: ReadonlyArray<string>;
}

/**
 * F6 (D-frontend-5.a) — vista que pinta la tarjeta de preview. La lista
 * de "sin acceso" se deriva del catálogo de permisos (ver
 * `UsersService.getPermissionsCatalog()`): son permisos del catálogo
 * que el rol **no** tiene, hasta un máximo de 2.
 */
export interface RolePermissionsView {
  readonly access: ReadonlyArray<string>;
  readonly noAccess: ReadonlyArray<string>;
}

/**
 * F6 (D-frontend-4, D-frontend-6) — payload que se envía a
 * `POST /api/users` con la convención snake_case del proyecto
 * (ver `UsersService.createUserJson()`). El backend acepta `phone`
 * desde el change paralelo `back/2026-09-08-f6-new-user-form/`.
 */
export interface CreateUserJsonPayload {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  role_id: string | null;
  organization_id: string | null;
}
