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
