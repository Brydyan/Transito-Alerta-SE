export interface RoleListItem {
  rolId: number;
  nombre: string;
}

export interface PermissionItem {
  permisoId: number;
  nombre: string;
  descripcion: string;
  recurso: string;
  accion: string;
}

export interface RolePermission {
  rolPermisoId: number;
  permisoId: number;
  nombre: string;
  descripcion: string;
  recurso: string;
  accion: string;
}

export interface RoleDetail {
  rolId: number;
  nombre: string;
  permisos: RolePermission[];
}

export interface UpdateRolePayload {
  permisosAsignar?: number[];
  permisosRevocar?: number[];
}

export interface PermissionWithState {
  permisoId: number;
  nombre: string;
  descripcion: string;
  accion: string;
  assigned: boolean;
}

export interface PermissionGroup {
  recurso: string;
  items: PermissionWithState[];
  allSelected: boolean;
  indeterminate: boolean;
  assignedCount: number;
}
