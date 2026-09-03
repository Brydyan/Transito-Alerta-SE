export interface MenuEntry {
  label: string;
  route: string;
  icon?: string;
  /**
   * F1 (D3/D4): encabezado de sección. Si está ausente, el item se
   * renderiza sin encabezado (típico del Dashboard, que va al tope).
   * El servicio puede omitir un grupo que quede vacío tras filtrar por
   * permisos (F1.2 — TDD `omits groups that become empty`).
   */
  group?: string;
  /**
   * F1 (D3): orden determinista dentro del menú. Obligatorio en la
   * salida (no opcional) para que el cliente no dependa del orden de
   * iteración de `Object.entries()`. La unidad de incremento es 10
   * para dejar espacio a inserciones sin reasignar todo el mapa.
   */
  order: number;
}

interface MenuDefinition {
  route: string;
  requires: string;
  icon?: string;
  group?: string;
  order: number;
}

/**
 * Mapa de navegación estático (R16) — sin almacenamiento en BD hasta F5.
 * Cada entrada nombra el permiso plano "ACTION resource" (mismo formato
 * que compara `PermissionGuard`, ver `require-permission.decorator.
 * formatPermissionString`) requerido para verla. `MenusService` filtra
 * este mapa contra el conjunto de permisos resueltos del usuario.
 *
 * F1 (D3/D4): reescrito para coincidir con los mocks 01-01 / 02-01 /
 * 05-01 — etiquetas en español, rutas reales (o reservadas como
 * placeholder en F2-F4), `group` y `order` para que el sidebar pueda
 * agrupar y ordenar. `Assignments` y `Comments` retirados: no tienen
 * pantalla en ninguno de los 18 mocks; sus permisos y endpoints
 * permanecen intactos.
 */
export const MENU_MAP: Record<string, MenuDefinition> = {
  Dashboard: {
    route: '/dashboard',
    requires: 'READ incidents',
    icon: 'layout-dashboard',
    order: 10,
  },
  Inicio: {
    route: '/inicio',
    requires: 'READ incidents',
    icon: 'home',
    group: 'INCIDENCIAS',
    order: 20,
  },
  'Lista de Incidencias': {
    route: '/incidencias',
    requires: 'READ incidents',
    icon: 'list',
    group: 'INCIDENCIAS',
    order: 30,
  },
  Mapa: {
    route: '/mapa',
    requires: 'READ incidents',
    icon: 'map',
    group: 'INCIDENCIAS',
    order: 40,
  },
  Reportar: {
    route: '/reportar',
    requires: 'CREATE incidents',
    icon: 'plus-circle',
    group: 'INCIDENCIAS',
    order: 50,
  },
  Usuarios: {
    route: '/admin/users',
    requires: 'READ users',
    icon: 'users',
    group: 'GESTIÓN',
    order: 60,
  },
  Roles: {
    route: '/admin/roles',
    requires: 'READ roles',
    icon: 'shield',
    group: 'GESTIÓN',
    order: 70,
  },
  Organizaciones: {
    route: '/organizaciones',
    requires: 'READ organizations',
    icon: 'building-2',
    group: 'GESTIÓN',
    order: 80,
  },
  Categorías: {
    route: '/categorias',
    requires: 'READ incident-categories',
    icon: 'tag',
    group: 'CATÁLOGOS',
    order: 90,
  },
  Ubicaciones: {
    route: '/ubicaciones',
    requires: 'READ geo-zones',
    icon: 'map-pin',
    group: 'CATÁLOGOS',
    order: 100,
  },
};
