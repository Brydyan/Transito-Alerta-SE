import { test, expect, Page } from '@playwright/test';

import { resolveE2eCredentials } from './_helpers/e2e-credentials';

/**
 * F2.4.2 — Permisos de Catálogos (Guard & DOM).
 *
 * El usuario e2e sembrado por la fase es `operador_org` (D1): NO
 * tiene permisos de escritura sobre Categorías. Eso lo hace el
 * candidato natural para este spec — antes usaba
 * `operador-org-1@tase.local`, que tiene el mismo rol pero cuyas
 * credenciales se tipean a mano y rotarlas rompería CI. Mismo rol,
 * distinto ciclo de vida de la contraseña.
 */

const creds = resolveE2eCredentials();

async function login(page: Page, user: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/usuario/i).fill(user);
  await page.getByLabel(/contraseña|password/i).fill(password);
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
  await page.waitForURL(/\/app\/dashboard/, { timeout: 15_000 });
}

test.describe('F2.4.2 — Permisos de Catálogos (Guard & DOM)', () => {
  test.skip(creds.skip, creds.skip ? creds.reason : '');

  test.beforeEach(async ({ page }) => {
    if (creds.skip) return;
    // This user lacks permission to create/edit Categories
    await login(page, creds.user, creds.password);
  });

  test('acciones de escritura no están en el DOM para usuarios sin permisos', async ({ page }) => {
    if (creds.skip) return;
    // If the operator tries to go to a catalog they shouldn't even see the write actions
    // Note: If they can't even see /categorias, we can navigate directly
    await page.goto('/app/categorias');

    // UI elements wrapped in *hasPermission should not be present
    const newButton = page.getByRole('button', { name: /nuevo/i });
    await expect(newButton).toHaveCount(0);

    const editButton = page.getByRole('button', { name: /edit/i });
    await expect(editButton).toHaveCount(0);

    const deleteButton = page.getByRole('button', { name: /delete/i });
    await expect(deleteButton).toHaveCount(0);
  });

  test('el acceso directo a /app/categorias/new queda bloqueado por el guard', async ({ page }) => {
    if (creds.skip) return;
    await page.goto('/app/categorias/new');

    // Should be redirected to dashboard
    await page.waitForURL(/\/app\/dashboard/);
    expect(page.url()).toContain('/app/dashboard');
  });
});
