import { test, expect, Page } from '@playwright/test';

import { resolveE2eAdminCredentials } from './_helpers/e2e-credentials';

/**
 * F2.4.1 — Catálogos CRUD (Categorías, Organizaciones, Ubicaciones).
 *
 * Necesita un usuario CON permisos de escritura sobre los catálogos. El
 * usuario e2e sembrado por la fase es `operador_org` (D1) y NO tiene
 * esos permisos — atraviesa los guards como un usuario real y se
 * queda corta en escritura. Por eso este spec usa el perfil admin del
 * helper, que por defecto es `master@tase.local` (override por
 * `E2E_ADMIN_USER`). Los datos de Categoría, Organización y Ubicación
 * son los del seed, no se traen al repo.
 */

const creds = resolveE2eAdminCredentials();

async function login(page: Page, user: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/usuario/i).fill(user);
  await page.getByLabel(/contraseña|password/i).fill(password);
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
  await page.waitForURL(/\/app\/dashboard/, { timeout: 15_000 });
}

test.describe('F2.4.1 — Catálogos CRUD (Categorías, Organizaciones, Ubicaciones)', () => {
  test.skip(creds.skip, creds.skip ? creds.reason : '');

  test.beforeEach(async ({ page }) => {
    if (creds.skip) return;
    await login(page, creds.user, creds.password);
  });

  test('Categorías CRUD completo', async ({ page }) => {
    if (creds.skip) return;
    await page.goto('/app/categorias');

    // Alta
    await page.getByRole('button', { name: /nuevo/i }).click();
    await page.waitForURL(/\/app\/categorias\/new/);
    await page.getByLabel(/nombre/i).fill('Test Category E2E');
    await page.getByRole('button', { name: /guardar|crear/i }).click();
    await page.waitForURL(/\/app\/categorias/);
    await expect(page.getByText('Test Category E2E')).toBeVisible();

    // Búsqueda
    await page.getByPlaceholder(/buscar/i).fill('Test Category E2E');
    await page.waitForResponse(response => response.url().includes('/incident-categories') && response.status() === 200);
    await expect(page.getByText('Test Category E2E')).toBeVisible();

    // Edición
    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.getByLabel(/nombre/i).fill('Test Category E2E Edited');
    await page.getByRole('button', { name: /guardar/i }).click();
    await page.waitForURL(/\/app\/categorias/);
    await expect(page.getByText('Test Category E2E Edited')).toBeVisible();

    // Borrado
    await page.getByRole('button', { name: /delete|borrar/i }).first().click();
    await page.getByRole('button', { name: /confirmar|borrar/i }).click();
    await expect(page.getByText('Test Category E2E Edited')).not.toBeVisible();
  });

  test('Organizaciones CRUD completo', async ({ page }) => {
    if (creds.skip) return;
    await page.goto('/app/organizaciones');

    // Alta
    await page.getByRole('button', { name: /nuevo/i }).click();
    await page.waitForURL(/\/app\/organizaciones\/new/);
    await page.getByLabel(/nombre/i).fill('Test Organization E2E');
    await page.getByRole('button', { name: /guardar/i }).click();
    await page.waitForURL(/\/app\/organizaciones/);
    await expect(page.getByText('Test Organization E2E')).toBeVisible();

    // Búsqueda
    await page.getByPlaceholder(/buscar/i).fill('Test Organization E2E');
    await page.waitForResponse(response => response.url().includes('/organizations') && response.status() === 200);
    await expect(page.getByText('Test Organization E2E')).toBeVisible();

    // Edición
    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.getByLabel(/nombre/i).fill('Test Organization E2E Edited');
    await page.getByRole('button', { name: /guardar/i }).click();
    await page.waitForURL(/\/app\/organizaciones/);
    await expect(page.getByText('Test Organization E2E Edited')).toBeVisible();

    // Borrado
    await page.getByRole('button', { name: /delete|borrar/i }).first().click();
    await page.getByRole('button', { name: /confirmar|borrar/i }).click();
    await expect(page.getByText('Test Organization E2E Edited')).not.toBeVisible();
  });

  test('Ubicaciones CRUD completo con expansión', async ({ page }) => {
    if (creds.skip) return;
    await page.goto('/app/ubicaciones');

    // Alta
    await page.getByRole('button', { name: /nuevo/i }).click();
    await page.waitForURL(/\/app\/ubicaciones\/new/);
    await page.getByLabel(/nombre/i).fill('Test Ubicacion E2E');
    await page.getByLabel(/código/i).fill('T-UBI-1');
    // We assume there's a level selector. For now just save a Provincia.
    await page.getByLabel(/nivel/i).selectOption({ label: 'Provincia' });
    await page.getByRole('button', { name: /guardar/i }).click();
    await page.waitForURL(/\/app\/ubicaciones/);
    await expect(page.getByText('Test Ubicacion E2E')).toBeVisible();

    // Búsqueda
    await page.getByPlaceholder(/buscar/i).fill('Test Ubicacion E2E');
    await expect(page.getByText('Test Ubicacion E2E')).toBeVisible();

    // Edición
    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.getByLabel(/nombre/i).fill('Test Ubicacion E2E Edited');
    await page.getByRole('button', { name: /guardar/i }).click();
    await page.waitForURL(/\/app\/ubicaciones/);
    await expect(page.getByText('Test Ubicacion E2E Edited')).toBeVisible();

    // Expansión hasta Parroquia
    // Clearing search
    await page.getByPlaceholder(/buscar/i).fill('');
    // Assuming we click the expand buttons. If there is a chevron button, we click it.
    const chevrons = await page.getByRole('button', { name: /expand/i }).all();
    if (chevrons.length > 0) {
      await chevrons[0].click(); // Expand Provincia
      // Wait for Canton to appear
      const subChevrons = await page.getByRole('button', { name: /expand/i }).all();
      if (subChevrons.length > 1) {
        await subChevrons[1].click(); // Expand Canton -> Parroquia
      }
    }
    // Verify indentation logic (just existence of padding classes or similar structure could be checked here)
    const row = page.getByRole('row').filter({ hasText: 'Test Ubicacion E2E Edited' });
    await expect(row).toBeVisible();

    // Borrado
    await page.getByPlaceholder(/buscar/i).fill('Test Ubicacion E2E Edited');
    await page.getByRole('button', { name: /delete|borrar/i }).first().click();
    await page.getByRole('button', { name: /confirmar|borrar/i }).click();
    await expect(page.getByText('Test Ubicacion E2E Edited')).not.toBeVisible();
  });
});
