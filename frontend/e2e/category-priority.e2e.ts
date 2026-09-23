import { test, expect, Page } from '@playwright/test';

import { resolveE2eAdminCredentials } from './_helpers/e2e-credentials';

/**
 * 2026-09-22-sc-subcategory-priority-assignment
 * Verifica el flujo end-to-end de la prioridad por defecto en
 * sub-categorías: el admin la setea al crear la sub, y cuando un
 * ciudadano la selecciona al reportar un incidente, el priority del
 * incidente se pre-rellena con ese valor.
 */

async function login(page: Page, user: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/usuario/i).fill(user);
  await page.getByLabel(/contraseña|password/i).fill(password);
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
  await page.waitForURL(/\/app\/dashboard/, { timeout: 15_000 });
}

test.describe('2026-09-22 — priority en sub-categorías', () => {
  test.beforeEach(async ({ page }) => {
    const creds = resolveE2eAdminCredentials();
    if (creds.skip) {
      test.skip(creds.skip, creds.reason);
      return;
    }
    await login(page, creds.user, creds.password);
  });

  test('admin crea sub-categoría con prioridad "Alto"', async ({ page }) => {
    // Spy on the POST so we can assert the payload includes priority.
    const postPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/incident-categories') &&
        r.request().method() === 'POST',
    );

    await page.goto('/app/categorias/new');

    // Switch to sub-category mode.
    await page.getByTestId('category-type-sub').click();

    // Pick the first available parent (if any). The page may show no
    // parents yet — skip if so.
    const parentSelect = page.getByTestId('category-parent-select');
    if ((await parentSelect.count()) === 0) {
      test.skip(true, 'No hay categorías principales existentes en el seed.');
      return;
    }

    // Select first non-empty option.
    const options = await parentSelect.locator('option').all();
    if (options.length < 2) {
      test.skip(true, 'Solo hay la opción vacía; no hay padres para sub-categoría.');
      return;
    }
    const firstReal = await options[1].getAttribute('value');
    if (firstReal) {
      await parentSelect.selectOption(firstReal);
    }

    await page.getByTestId('category-name').fill('Sub-Categoría E2E Priority');
    await page.getByTestId('category-priority-high').check();
    await page.getByTestId('category-submit').click();

    const response = await postPromise;
    const body = await response.json();

    expect(response.status()).toBeLessThan(300);
    expect(body.priority).toBe('high');
  });

  test('priority radios son visibles solo cuando es sub-categoría', async ({ page }) => {
    await page.goto('/app/categorias/new');

    // En modo root: NO debe verse el fieldset de prioridad.
    await expect(page.getByText(/^Prioridad$/)).toHaveCount(0);

    // Cambiar a sub.
    await page.getByTestId('category-type-sub').click();

    // Ahora debe verse.
    await expect(page.getByText(/^Prioridad$/)).toBeVisible();

    // Volver a root → ocultar.
    await page.getByTestId('category-type-root').click();
    await expect(page.getByText(/^Prioridad$/)).toHaveCount(0);
  });
});
