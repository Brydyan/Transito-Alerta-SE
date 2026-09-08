export interface RoleListItem {
  rolId: number;
  nombre: string;
  /**
   * F6 (`2026-09-08-f6-roles-redesign`) — proyección del wire shape.
   * El backend devuelve `permisos.length` o un contador dedicado;
   * acá proyectamos a `permissionCount` (mock 04-01 lo espera).
   * Si el backend no lo manda, queda en 0 y la badge se ve como
   * guion (D5: cero es un valor, no un placeholder).
   */
  permissionCount?: number;
  /**
   * F6 — etiqueta «Sistema» del mock 04-01 para roles built-in
   * (admin_sistema, operador_sistema). El backend lo deduce o lo
   * expone como `isSystemRole: boolean`; si no, queda en false.
   */
  isSystemRole?: boolean;
}

/**
 * F6 (`2026-09-08-f6-roles-redesign`) — métricas agregadas que
 * alimentan las 3 `StatsCardsComponent`. El backend
 * (`GET /api/roles/stats`) las devuelve como objeto plano.
 */
export interface RoleStats {
  totalPermissions: number;
  protectedModules: number;
  assignedUsers: number;
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
