import { PaginatedMeta, PaginatedResponse } from '../../../../shared/models/paginated-response';
import { Avatar } from '../../../../core/models/auth.model';

export type { Avatar };

export interface Role {
  rolId: number;
  nombre: string;
}

export interface RolePermission {
  rolPermisoId: number;
  permisoId: number;
  nombre: string;
  descripcion: string;
  recurso: string;
  accion: string;
}

export interface RoleDetail extends Role {
  permisos: RolePermission[];
}

export interface PermissionItem {
  permisoId: number;
  nombre: string;
  descripcion: string;
  recurso: string;
  accion: string;
}

export interface DirectPermission {
  usuarioPermisoId: number;
  permisoId: number;
  recurso: string;
  accion: string;
  permitido: boolean;
}

export interface User {
  usuarioId: number;
  email: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  avatar?: Avatar | null;
  rol: Role | null;
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
  rolId?: number;
  avatar?: Avatar;
}

export interface UpdateUserPayload {
  email?: string;
  nombres?: string;
  apellidos?: string;
  telefono?: string;
  rolId?: number;
  avatar?: Avatar;
  directPermissions?: { permisoId: number; permitido: boolean }[];
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
