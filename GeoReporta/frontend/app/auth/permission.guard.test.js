/**
 * Permission Guard unit tests — sources authorization from menuService
 * so the sidebar and the router share exactly ONE source of truth.
 *
 * Covers:
 *   R-20: blocks citizen from admin routes (redirects to /not-found).
 *   R-21: allows admin_sistema past admin routes when menu permits.
 *   R-22: replaces roleGuard on /roles with permissionGuard.
 */
const mockMenuService = vi.hoisted(() => ({
  getMyMenu: vi.fn(),
  invalidateMyMenu: vi.fn(),
}));
const mockPermissionService = vi.hoisted(() => ({
  getMyPermissions: vi.fn(),
  invalidateMyPermissions: vi.fn(),
}));

vi.mock('../shared/menu.service.js', () => ({ menuService: mockMenuService }));
vi.mock('../shared/permission.service.js', () => ({
  permissionService: mockPermissionService,
}));

import { permissionGuard } from './permission.guard.js';

describe('permissionGuard', () => {
  beforeEach(() => {
    mockMenuService.getMyMenu.mockReset();
    mockMenuService.invalidateMyMenu.mockReset();
    mockPermissionService.getMyPermissions.mockReset();
    mockPermissionService.invalidateMyPermissions.mockReset();
    window.location.hash = '';
  });

  // ─── R-20: citizen is blocked from /usuarios ────────────────────────

  it('blocks citizen from /usuarios route (R-20)', async () => {
    window.location.hash = '#/usuarios';
    // Citizen's menu: no admin items at all.
    mockMenuService.getMyMenu.mockResolvedValue([
      {
        id: 1,
        name: 'Inicio',
        route: '/feed',
        icon: null,
        children: [],
      },
    ]);

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(false);
    expect(window.location.hash).toBe('#/not-found');
    expect(mockMenuService.getMyMenu).toHaveBeenCalledTimes(1);
  });

  // ─── R-21: admin_sistema passes /usuarios ───────────────────────────

  it('allows admin_sistema past /usuarios route (R-21)', async () => {
    window.location.hash = '#/usuarios';
    mockMenuService.getMyMenu.mockResolvedValue([
      {
        id: 1,
        name: 'Usuarios',
        route: '/usuarios',
        icon: null,
        children: [],
      },
    ]);

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(true);
    expect(window.location.hash).toBe('#/usuarios');
  });

  // ─── R-22: /roles replaces roleGuard — positive case ────────────────

  it('allows admin_sistema on /roles route when menu has /roles entry (R-22)', async () => {
    window.location.hash = '#/roles';
    mockMenuService.getMyMenu.mockResolvedValue([
      {
        id: 1,
        name: 'Roles',
        route: '/roles',
        icon: 'shield',
        children: [],
      },
    ]);

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(true);
    expect(window.location.hash).toBe('#/roles');
  });

  // ─── R-22: /roles replaced guard must still deny unauthorized user ───

  it('blocks /roles route when menu has no /roles entry (R-22 regression guard)', async () => {
    window.location.hash = '#/roles';
    // Operator with no /roles entry in their menu.
    mockMenuService.getMyMenu.mockResolvedValue([
      {
        id: 1,
        name: 'Incidencias',
        route: '/incidencias',
        icon: null,
        children: [],
      },
    ]);

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(false);
    expect(window.location.hash).toBe('#/not-found');
  });

  // ─── Triangulation: nested children are also recognized ──────────────

  it('recognizes routes nested under a section header (children array)', async () => {
    window.location.hash = '#/incidencias';
    // Section headers have route === null; navigable routes live under children.
    mockMenuService.getMyMenu.mockResolvedValue([
      {
        id: 1,
        name: 'Incidencias',
        route: null,
        icon: null,
        children: [
          {
            id: 2,
            name: 'Lista',
            route: '/incidencias',
            icon: null,
            children: [],
          },
        ],
      },
    ]);

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(true);
    expect(window.location.hash).toBe('#/incidencias');
  });

  // ─── BLOCKER fix: query strings must be stripped before matching ─────
  // Previously `/incidencias/crear?id=5` (the real hash edit flows use)
  // never string-equaled the menu's literal `/incidencias/crear` entry,
  // so admin_sistema itself got redirected to /not-found editing anything.

  it('strips the query string before matching a literal menu route', async () => {
    window.location.hash = '#/incidencias/crear?id=5';
    mockMenuService.getMyMenu.mockResolvedValue([
      { id: 1, name: 'Nueva', route: '/incidencias/crear', children: [] },
    ]);

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(true);
  });

  // ─── BLOCKER fix: child routes with no menu entry (CHILD_ROUTE_PERMISSIONS) ─

  it('allows a :id detail route when the user holds the mapped permission', async () => {
    window.location.hash = '#/incidencias/42';
    mockMenuService.getMyMenu.mockResolvedValue([]);
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['incidents.view']),
    );

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(true);
  });

  it('blocks a :id detail route when the user lacks the mapped permission', async () => {
    window.location.hash = '#/incidencias/42';
    mockMenuService.getMyMenu.mockResolvedValue([]);
    mockPermissionService.getMyPermissions.mockResolvedValue(new Set([]));

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(false);
    expect(window.location.hash).toBe('#/not-found');
  });

  it('does not over-grant /usuarios/crear from users.view alone (needs users.create)', async () => {
    // Regression guard for the exact over-grant a naive parent-prefix
    // fallback would introduce: admin_organizacion has users.view (sees
    // /usuarios in their menu) but must NOT automatically reach
    // /usuarios/crear without users.create.
    window.location.hash = '#/usuarios/crear';
    mockMenuService.getMyMenu.mockResolvedValue([
      { id: 1, name: 'Usuarios', route: '/usuarios', children: [] },
    ]);
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['users.view']),
    );

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(false);
    expect(mockPermissionService.getMyPermissions).toHaveBeenCalledTimes(1);
  });

  it('allows /usuarios/crear when the user holds users.create', async () => {
    window.location.hash = '#/usuarios/crear';
    mockMenuService.getMyMenu.mockResolvedValue([
      { id: 1, name: 'Usuarios', route: '/usuarios', children: [] },
    ]);
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['users.view', 'users.create']),
    );

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(true);
  });

  it('gates /roles/:id on roles.update, not roles.view (replaces roleGuard admin_sistema-only restriction)', async () => {
    window.location.hash = '#/roles/7';
    mockMenuService.getMyMenu.mockResolvedValue([
      { id: 1, name: 'Roles', route: '/roles', children: [] },
    ]);
    // admin_organizacion-shaped grant: roles.view but not roles.update.
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['roles.view']),
    );

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(false);
  });

  // ─── CRITICAL fix: fail closed (not silently hang) on a fetch error ───

  it('fails closed and redirects to /not-found when menuService rejects', async () => {
    window.location.hash = '#/usuarios';
    mockMenuService.getMyMenu.mockRejectedValue(new Error('network error'));

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(false);
    expect(window.location.hash).toBe('#/not-found');
  });

  it('fails closed when permissionService rejects for a child route', async () => {
    window.location.hash = '#/incidencias/42';
    mockMenuService.getMyMenu.mockResolvedValue([]);
    mockPermissionService.getMyPermissions.mockRejectedValue(
      new Error('network error'),
    );

    const result = await permissionGuard.canActivate({});

    expect(result).toBe(false);
    expect(window.location.hash).toBe('#/not-found');
  });
});
