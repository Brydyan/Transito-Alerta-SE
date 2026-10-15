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

function findRoute(tree: Route[], ...segments: string[]): Route | undefined {
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
});
