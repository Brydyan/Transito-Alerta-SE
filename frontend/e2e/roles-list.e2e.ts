import { test, expect, type Route } from '@playwright/test';

/**
 * RolesList rediseñado — F6 (`2026-09-08-f6-roles-redesign`).
 *
 * S1: lista carga con 5 roles
 * S2: búsqueda filtra local
 * S3: permission badges muestran conteos (48, 32, 24, 18, 8)
 * S4: stats cards muestran 124 / 12 / 85
 * S5: delete refresca la lista
 *
 * Sin backend real: skipea sin `BASE_URL`+`E2E_PASSWORD` (D4).
 */
const HAS_BACKEND = !!(process.env['BASE_URL']?.trim() && process.env['E2E_PASSWORD']?.trim());

const fixtureRoles = [
  { rolId: 1, nombre: 'admin_sistema', isSystemRole: true, permissionCount: 48 },
  { rolId: 2, nombre: 'operador_sistema', isSystemRole: true, permissionCount: 32 },
  { rolId: 3, nombre: 'admin_organizacion', isSystemRole: false, permissionCount: 24 },
  { rolId: 4, nombre: 'operador_organizacion', isSystemRole: false, permissionCount: 18 },
  { rolId: 5, nombre: 'usuario', isSystemRole: false, permissionCount: 8 },
];

const fixtureStats = {
  totalPermissions: 124,
  protectedModules: 12,
  assignedUsers: 85,
};

test.describe('RolesList rediseñado (F6)', () => {
  test.skip(!HAS_BACKEND, 'Requiere staging con E2E_PASSWORD.');

  test('S1 — Lista carga con 5 roles', async ({ page }) => {
    await login(page);
    await page.route('**/api/roles**', async (route: Route) => {
      if (route.request().method() === 'GET' && !route.url().includes('/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(fixtureRoles),
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/app/admin/roles');
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible();
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(5);
  });

  test('S2 — Búsqueda filtra local por nombre', async ({ page }) => {
    await login(page);
    await page.route('**/api/roles**', async (route: Route) => {
      if (route.request().method() === 'GET' && !route.url().includes('/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(fixtureRoles),
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/app/admin/roles');
    await page.getByPlaceholder(/nombre del rol/i).fill('operador');
    // Esperar el debounce de 300 ms.
    await page.waitForTimeout(400);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
  });

  test('S3 — Permission badges muestran el conteo (48, 32, 24, 18, 8)', async ({ page }) => {
    await login(page);
    await page.route('**/api/roles**', async (route: Route) => {
      if (route.request().method() === 'GET' && !route.url().includes('/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(fixtureRoles),
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/app/admin/roles');
    // Cada fila tiene un .permission-badge con el conteo.
    const badges = page.locator('.permission-badge');
    await expect(badges).toHaveCount(5);
    const labels = await badges.allTextContents();
    expect(labels).toEqual(['48', '32', '24', '18', '8']);
  });

  test('S4 — Stats cards muestran 124 / 12 / 85', async ({ page }) => {
    await login(page);
    await page.route('**/api/roles/stats', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fixtureStats),
      });
    });
    await page.route('**/api/roles**', async (route: Route) => {
      if (!route.url().includes('/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(fixtureRoles),
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/app/admin/roles');
    const values = page.locator('.stat-value');
    await expect(values).toHaveCount(3);
    await expect(values.nth(0)).toContainText('124');
    await expect(values.nth(1)).toContainText('12');
    await expect(values.nth(2)).toContainText('85');
  });

  test('S5 — Delete usuario refresca la lista', async ({ page }) => {
    await login(page);
    let callCount = 0;
    await page.route('**/api/roles**', async (route: Route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      if (route.url().includes('/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(fixtureStats),
        });
        return;
      }
      callCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          callCount > 1 ? fixtureRoles.slice(0, 4) : fixtureRoles,
        ),
      });
    });
    await page.addInitScript(() => {
      window.confirm = () => true;
    });
    await page.goto('/app/admin/roles');
    const firstAction = page.locator('tbody tr').first().locator('app-action-menu button').nth(1);
    await firstAction.click();
    await page.getByRole('menuitem', { name: /eliminar/i }).click();
    await page.waitForTimeout(300);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(4);
  });
});

async function login(page: import('@playwright/test').Page): Promise<void> {
  const { resolveE2eCredentials } = await import('./_helpers/e2e-credentials');
  const creds = resolveE2eCredentials();
  if (creds.skip) {
    throw new Error('login() llamado sin credenciales configuradas — el describe debería haber skipeado');
  }
  await page.goto('/login');
  await page.getByLabel(/usuario/i).fill(creds.user);
  await page.getByLabel(/contraseña|password/i).fill(creds.password);
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
  await page.waitForURL(/\/app\//, { timeout: 15_000 });
}
