export interface MenuEntry {
  label: string;
  route: string;
  icon?: string;
}

interface MenuDefinition {
  route: string;
  requires: string;
  icon?: string;
}

/**
 * Static navigation map (R16) — no DB storage. Each entry names the flat
 * "ACTION resource" permission string (same shape PermissionGuard compares,
 * see require-permission.decorator.formatPermissionString) required to see
 * it. MenusService filters this by the caller's resolved permission set.
 */
export const MENU_MAP: Record<string, MenuDefinition> = {
  Incidents: { route: '/incidents', requires: 'READ incidents', icon: 'alert-triangle' },
  Assignments: { route: '/assignments', requires: 'READ assignments', icon: 'clipboard-list' },
  Comments: { route: '/comments', requires: 'READ comments', icon: 'message-circle' },
  Users: { route: '/users', requires: 'READ users', icon: 'users' },
  Roles: { route: '/roles', requires: 'READ roles', icon: 'shield' },
};
