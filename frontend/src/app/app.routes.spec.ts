import { permissionGuard } from './core/guards/permission.guard';
import { routes } from './app.routes';
import { Route } from '@angular/router';

/**
 * Admin route guard metadata spec
 * Change: front/2026-10-14-admin-route-guards
 *
 * These tests verify that every admin list route declares
 * `canActivate: [permissionGuard]` and the correct `data.permission` string.
 * They are purely structural — no router bootstrap needed — because Angular's
 * router evaluates `canActivate` and `data` from the static route tree.
 *
 * Ref: design.md D1 (per-route guard pattern) and D2 (permission string table).
 */

function _findRoute(tree: Route[], ...segments: string[]): Route | undefined {
  let current: Route[] = tree;
  let found: Route | undefined;

  for (const segment of segments) {
    found = current.find((r) => r.path === segment);
    if (!found) return undefined;
    current = found.children ?? [];
  }

  return found;
}

describe('admin route guard metadata', () => {
  // ------------------------------------------------------------------
  // Helper: locate the admin subtree
  // ------------------------------------------------------------------
  const appRoute = routes.find((r) => r.path === 'app');
  const adminRoute = appRoute?.children?.find((r) => r.path === 'admin');
  const adminChildren = adminRoute?.children ?? [];

  // ------------------------------------------------------------------
  // Task 2.1 — admin/users list (path: '')
  // ------------------------------------------------------------------
  describe('admin/users list route', () => {
    const usersParent = adminChildren.find((r) => r.path === 'users');
    const usersListRoute = usersParent?.children?.find((r) => r.path === '');

    it('has canActivate: [permissionGuard]', () => {
      expect(usersListRoute?.canActivate).toContain(permissionGuard);
    });

    it('has data.permission: "READ users"', () => {
      expect(usersListRoute?.data?.['permission']).toBe('READ users');
    });
  });

  // ------------------------------------------------------------------
  // Task 2.2 — admin/roles list
  // ------------------------------------------------------------------
  describe('admin/roles list route', () => {
    const rolesRoute = adminChildren.find((r) => r.path === 'roles');

    it('has canActivate: [permissionGuard]', () => {
      expect(rolesRoute?.canActivate).toContain(permissionGuard);
    });

    it('has data.permission: "READ roles"', () => {
      expect(rolesRoute?.data?.['permission']).toBe('READ roles');
    });
  });

  // ------------------------------------------------------------------
  // Task 2.3 — admin/config — guard already exists but data.permission was missing
  // ------------------------------------------------------------------
  describe('admin/config route', () => {
    const configRoute = adminChildren.find((r) => r.path === 'config');

    it('has canActivate: [permissionGuard]', () => {
      expect(configRoute?.canActivate).toContain(permissionGuard);
    });

    it('has data.permission: "READ system-config"', () => {
      expect(configRoute?.data?.['permission']).toBe('READ system-config');
    });
  });

  // ------------------------------------------------------------------
  // Task 2.4 — admin/departamentos list (path: '')
  // ------------------------------------------------------------------
  describe('admin/departamentos list route', () => {
    const deptParent = adminChildren.find((r) => r.path === 'departamentos');
    const deptListRoute = deptParent?.children?.find((r) => r.path === '');

    it('has canActivate: [permissionGuard]', () => {
      expect(deptListRoute?.canActivate).toContain(permissionGuard);
    });

    it('has data.permission: "READ departments"', () => {
      expect(deptListRoute?.data?.['permission']).toBe('READ departments');
    });
  });

  // ------------------------------------------------------------------
  // Task 2.5 — admin/organizaciones list (path: '')
  // ------------------------------------------------------------------
  describe('admin/organizaciones list route', () => {
    const orgParent = adminChildren.find((r) => r.path === 'organizaciones');
    const orgListRoute = orgParent?.children?.find((r) => r.path === '');

    it('has canActivate: [permissionGuard]', () => {
      expect(orgListRoute?.canActivate).toContain(permissionGuard);
    });

    it('has data.permission: "READ organizations"', () => {
      expect(orgListRoute?.data?.['permission']).toBe('READ organizations');
    });
  });

  // ------------------------------------------------------------------
  // 2026-10-20 — /app/reportar no era alcanzable por rol sin permiso
  //
  // El menú ya ocultaba "Reportar" a los roles sin `CREATE incidents`
  // (0029:174-185, "reportar-operator-org-block"), pero la RUTA no: un
  // operator_org podía escribir /app/reportar a mano, cargar el formulario
  // entero y recién ahí recibir un 403 de POST /api/incidents. El menú y la
  // ruta discrepaban, y el permiso se comunicaba con un error genérico en vez
  // de por la UI que ya le decía que no podía.
  //
  // Esta regresión es estructural a propósito — mismo patrón que las de admin:
  // Angular evalúa `canActivate` y `data` del árbol estático, así que no hace
  // falta arrancar el router.
  // ------------------------------------------------------------------
  describe('/app/reportar route', () => {
    const appRoute = routes.find((r) => r.path === 'app');
    const reportarRoute = appRoute?.children?.find((r) => r.path === 'reportar');

    it('existe', () => {
      expect(reportarRoute).toBeDefined();
    });

    it('has canActivate: [permissionGuard]', () => {
      expect(reportarRoute?.canActivate).toContain(permissionGuard);
    });

    it('declara data.permission: "CREATE incidents" — el mismo permiso que exige POST /api/incidents', () => {
      expect(reportarRoute?.data?.['permission']).toBe('CREATE incidents');
    });

    it('NO queda descubrible como ruta sin permisos (regresión del 403 en /app/reportar)', () => {
      // Si alguien saca el guard "sólo para probar", esto falla acá y no
      // recién cuando un operador llena un formulario y recibe un 403.
      expect(reportarRoute?.canActivate).toBeDefined();
      expect(reportarRoute?.data?.['permission']).toBeTruthy();
    });
  });
});
