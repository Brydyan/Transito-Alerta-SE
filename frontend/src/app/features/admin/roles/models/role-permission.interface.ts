export interface RoleListItem {
  // F6 fix: `rolId` es UUID (string), no number. El backend
  // devuelve `id: "uuid"`. El type legacy `number` no matcheaba
  // con el wire y rompía el `navigate(['/app/admin/roles', id])`.
  rolId: string;
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
  // F6 fix: `permisoId` es UUID (string), no number. El backend
  // `GET /api/permissions` devuelve `id: "uuid"`. El Set<> del
  // role-editor usaba `Set<number>` y nunca matcheaba.
  permisoId: string;
  nombre: string;
  descripcion: string;
  recurso: string;
  accion: string;
}

export interface RolePermission {
  // F6 fix: UUIDs (string), no number. `rolPermisoId` es el id
  // del join row; `permisoId` es la FK al catálogo de permisos.
  rolPermisoId: string;
  permisoId: string;
  nombre: string;
  descripcion: string;
  recurso: string;
  accion: string;
}

export interface RoleDetail {
  // F6 fix: `rolId` es UUID (string).
  rolId: string;
  nombre: string;
  /**
   * F6 fix: el wire real del backend (`GET /api/roles/:id`) es
   * `permissions: string[]` (array de strings formato
   * "ACTION resource"), no objetos `RolePermission[]` con
   * `permisoId/nombre/descripcion`. El role-editor lo trata
   * como `string[]` y construye los `PermissionWithState`
   * cruzando contra `allPermissions()` (que SÍ tiene la forma
   * estructurada del catálogo).
   */
  permisos: string[];
}

/**
 * F6 fix: el backend espera `permissions: string[]` (PUT
 * semantics — reemplaza el set completo), NO
 * `permisosAsignar`/`permisosRevocar` (que era la suposición
 * del role-editor antes de este fix). El frontend computa el
 * diff en memoria (assignedIds vs originalIds) pero el PATCH
 * manda el array final entero.
 */
export interface UpdateRolePayload {
  name?: string;
  permissions?: string[];
}

/**
 * F6 (`2026-09-08-f6-roles-redesign`) — body para
 * `POST /api/roles` (mock 04-02 «Nuevo Rol de Sistema»). El backend
 * (`CreateRoleDto`) exige `name` (min 2, max 50 chars) y acepta
 * `description?` y `permissions?` (default `[]`). El frontend
 * recoge los checkboxes de la matriz de permisos y los manda como
 * `permissions: string[]` (UUIDs).
 */
export interface CreateRolePayload {
  name: string;
  description?: string;
  permissions?: string[];
}

export interface PermissionWithState {
  permisoId: string;
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
