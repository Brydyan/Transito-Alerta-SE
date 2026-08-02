/**
 * Permission Guard — sources route authorization from menuService (the
 * sidebar's own data, so list-page routes and the guard share exactly ONE
 * source of truth) plus a small explicit map for the handful of child
 * routes that have no menu entry of their own (detail pages, "crear"
 * sub-routes) but DO need their own distinct permission.
 *
 * Why not just prefix-match a child route against its parent's menu
 * presence (e.g. allow /usuarios/crear because /usuarios is allowed)?
 * Because "can see the list" and "can create" are genuinely different
 * grants in this system — e.g. admin_organizacion has organizations.view +
 * organizations.update but NOT organizations.create. A blanket prefix
 * fallback would silently over-grant /organizaciones/crear (and similarly
 * /localizaciones/crear, /categorias/crear for operador_sistema, which has
 * .view on both but no .create). So child routes without a menu entry are
 * checked against the user's raw permission list instead (permissionService,
 * GET /api/permissions/my) — see CHILD_ROUTE_PERMISSIONS below.
 *
 * On a miss the guard calls `router.navigate('/not-found')` so the route's
 * existence is not leaked (a citizen who types a guessed admin URL sees a
 * generic 404, never a permissions error that would tell them the URL was
 * real). The same happens on a fetch failure (network error, backend
 * down) — fail CLOSED, not open, and never leave an unhandled promise
 * rejection hanging (the previous version had no try/catch here at all).
 *
 * Usage:
 *   import { permissionGuard } from './auth/permission.guard.js';
 *   router.addRoute('/usuarios', usuariosComponent, [permissionGuard], 'admin');
 */
import { router } from '../core/router.js';
import { menuService } from '../shared/menu.service.js';
import { permissionService } from '../shared/permission.service.js';

/**
 * Routes with no menu entry of their own, mapped to the exact permission
 * slug they require. Checked against permissionService (raw grants), NOT
 * against the menu tree. `:id`-style segments match any single path
 * segment, same convention as router.js's own route patterns.
 */
const CHILD_ROUTE_PERMISSIONS = {
  '/operator/dashboard': 'dashboard.view',
  '/usuarios/crear': 'users.create',
  '/organizaciones/crear': 'organizations.create',
  '/localizaciones/crear': 'locations.create',
  '/categorias/crear': 'incident-categories.create',
  '/incidencias/crear': 'incidents.create',
  '/incidencias/:id': ['incidents.view', 'feed.detail'],
  // roles: /roles/create requires roles.create (parametrized create route)
  // /roles/:id requires roles.update for edit, or roles.create if id='create'
  '/roles/create': 'roles.create',
  '/roles/:id': 'roles.update',
  '/notificaciones': 'notifications.update',
};

/**
 * @param {{ params?: Record<string,string>, query?: URLSearchParams, role?: string }} _ctx
 * @returns {Promise<boolean>}
 */
export const permissionGuard = {
  async canActivate(_ctx) {
    const [requestedPath, queryString] = (
      window.location.hash.slice(1) || '/'
    ).split('?');

    let allowed;
    try {
      allowed = await isAllowed(requestedPath, queryString);
    } catch {
      // menuService/permissionService failed (network error, backend
      // down) — fail closed rather than let this reject silently and
      // strand navigation with no feedback.
      allowed = false;
    }

    if (!allowed) {
      router.navigate('/not-found');
      return false;
    }
    return true;
  },
};

async function isAllowed(requestedPath, queryString = '') {
  const tree = await menuService.getMyMenu();
  if (flattenRoutes(tree).has(requestedPath)) {
    return true;
  }

  for (const [pattern, permission] of Object.entries(CHILD_ROUTE_PERMISSIONS)) {
    if (matchesPattern(pattern, requestedPath)) {
      const perms = await permissionService.getMyPermissions();

      // Acepta string único o array de permisos (OR lógico).
      const hasPermission = (slug) => perms.has(slug);
      const check = (p) =>
        Array.isArray(p) ? p.some(hasPermission) : hasPermission(p);

      // These "crear" routes are reused for editing too (index pages
      // navigate to `X/crear?id=N` — see e.g. organizaciones.index
      // .component.js). A role can have `.update` without `.create`
      // (admin_organizacion: organizations.view + .update, no .create),
      // so when `id` is present this must also accept the `.update`
      // grant — otherwise a role that's allowed to edit gets bounced
      // to /not-found for lacking a permission editing never needed.
      if (
        !Array.isArray(permission) &&
        permission.endsWith('.create') &&
        new URLSearchParams(queryString).has('id')
      ) {
        const updatePermission = permission.replace(/\.create$/, '.update');

        return hasPermission(permission) || hasPermission(updatePermission);
      }

      return check(permission);
    }
  }

  return false;
}

/**
 * Same segment-count + `:param` matching convention as
 * router.js::_matchPattern, kept local (not imported) since router.js
 * doesn't export it standalone off the Router instance.
 */
function matchesPattern(pattern, path) {
  const pp = pattern.split('/');
  const ap = path.split('/');
  if (pp.length !== ap.length) return false;
  for (let i = 0; i < pp.length; i++) {
    if (!pp[i].startsWith(':') && pp[i] !== ap[i]) return false;
  }
  return true;
}

/**
 * Walks the menu tree (recursive children) and returns a Set of every
 * non-null route string. Section headers have `route === null` — they
 * group children but are not destinations themselves, so we skip them.
 *
 * @param {Array<{route: ?string, children?: Array}>|null|undefined} nodes
 * @returns {Set<string>}
 */
function flattenRoutes(nodes) {
  const set = new Set();
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const n of list) {
      if (typeof n.route === 'string' && n.route.length > 0) {
        set.add(n.route);
      }
      if (Array.isArray(n.children)) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return set;
}
