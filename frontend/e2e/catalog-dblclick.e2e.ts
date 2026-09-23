import { test, expect, Page } from '@playwright/test';

import { resolveE2eAdminCredentials } from './_helpers/e2e-credentials';

/**
 * 2026-09-22-sc-tree-list-double-click-expand-catalog
 * Verifica el gesto de doble-click en filas de las listas de
 * Categorías (`/app/categorias`) y Ubicaciones (`/app/ubicaciones`).
 *
 * El árbol renderiza cada item como `tr` dentro de `<ui-table>`. Los
 * items con hijos llevan un botón con `aria-label`:
 *   - Categorías: "Expandir sub-categorías" / "Contraer sub-categorías"
 *   - Ubicaciones: "Alternar hijos"
 * El nuevo gesto: doble-click en cualquier parte del `<tr>` = toggle.
 */

async function login(page: Page, user: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/usuario/i).fill(user);
  await page.getByLabel(/contraseña|password/i).fill(password);
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
  await page.waitForURL(/\/app\/dashboard/, { timeout: 15_000 });
}

function rowByName(page: Page, name: string) {
  return page.locator('tbody tr', { hasText: name }).first();
}

test.describe('2026-09-22 — doble-click en catálogos (categorías y ubicaciones)', () => {
  test.beforeEach(async ({ page }) => {
    const creds = resolveE2eAdminCredentials();
    if (creds.skip) {
      test.skip(creds.skip, creds.reason);
      return;
    }
    await login(page, creds.user, creds.password);
  });

  test('doble-click expande una categoría con hijos', async ({ page }) => {
    await page.goto('/app/categorias');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // Buscar la primera fila con un toggle button (parent con hijos).
    const parentRow = page.locator('tbody tr').filter({
      has: page.locator('button[data-testid="category-toggle"]'),
    }).first();

    if ((await parentRow.count()) === 0) {
      test.skip(true, 'No hay categorías con hijos en el seed.');
      return;
    }

    const toggle = parentRow.locator('button[data-testid="category-toggle"]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await parentRow.dblclick();

    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });
  });

  test('doble-click expande una ubicación con hijos', async ({ page }) => {
    await page.goto('/app/ubicaciones');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // Ubicaciones: el chevron lleva aria-label="Alternar hijos".
    const parentRow = page.locator('tbody tr').filter({
      has: page.locator('button[aria-label="Alternar hijos"]'),
    }).first();

    if ((await parentRow.count()) === 0) {
      test.skip(true, 'No hay ubicaciones con hijos en el seed.');
      return;
    }

    const toggle = parentRow.locator('button[aria-label="Alternar hijos"]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await parentRow.dblclick();

    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });
  });

  test('doble-click colapsa una categoría expandida', async ({ page }) => {
    await page.goto('/app/categorias');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // Buscar una fila con hijos.
    const parentRow = page.locator('tbody tr').filter({
      has: page.locator('button[data-testid="category-toggle"]'),
    }).first();

    if ((await parentRow.count()) === 0) {
      test.skip(true, 'No hay categorías con hijos en el seed.');
      return;
    }

    const toggle = parentRow.locator('button[data-testid="category-toggle"]');

    // Expandir primero
    await parentRow.dblclick();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });

    // Segundo dblclick colapsa
    await parentRow.dblclick();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 2_000 });
  });

  test('doble-click colapsa una ubicación expandida', async ({ page }) => {
    await page.goto('/app/ubicaciones');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    const parentRow = page.locator('tbody tr').filter({
      has: page.locator('button[aria-label="Alternar hijos"]'),
    }).first();

    if ((await parentRow.count()) === 0) {
      test.skip(true, 'No hay ubicaciones con hijos en el seed.');
      return;
    }

    const toggle = parentRow.locator('button[aria-label="Alternar hijos"]');

    // Expandir primero
    await parentRow.dblclick();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });

    // Segundo dblclick colapsa
    await parentRow.dblclick();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 2_000 });
  });

  test('chevron click sigue funcionando después de cambios de doble-click', async ({ page }) => {
    await page.goto('/app/categorias');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    const parentRow = page.locator('tbody tr').filter({
      has: page.locator('button[data-testid="category-toggle"]'),
    }).first();

    if ((await parentRow.count()) === 0) {
      test.skip(true, 'No hay categorías con hijos en el seed.');
      return;
    }

    const toggle = parentRow.locator('button[data-testid="category-toggle"]');

    // Click directo en el chevron (no dblclick)
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });

    // Click chevron de nuevo colapsa
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 2_000 });
  });

  test('doble-click en fila sin hijos (leaf) no produce cambios', async ({ page }) => {
    await page.goto('/app/categorias');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // Buscar una fila SIN toggle button (hoja, sin hijos).
    const leafRow = page.locator('tbody tr').filter({
      has: page.locator('button[data-testid="category-toggle"]').locator('visible=false'),
    }).first();

    if ((await leafRow.count()) === 0) {
      test.skip(true, 'No hay categorías sin hijos en el seed.');
      return;
    }

    // Doblclick en hoja no debería cambiar nada (no hay toggle para verificar).
    // Verificamos que no lance error y que la fila siga siendo una hoja.
    await leafRow.dblclick();
    await page.waitForTimeout(500); // pequeña pausa para verificar estabilidad

    // La fila sin toggle sigue sin toggle
    const toggle = leafRow.locator('button[data-testid="category-toggle"]');
    await expect(toggle).toHaveCount(0);
  });

  test('doble-click no selecciona el texto de la fila', async ({ page }) => {
    await page.goto('/app/categorias');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    const firstRow = page.locator('tbody tr').first();

    if ((await firstRow.count()) === 0) {
      test.skip(true, 'No hay categorías en el seed.');
      return;
    }

    // Doblclick y verificar que no hay texto seleccionado
    await firstRow.dblclick();

    const selectedText = await page.evaluate(() => {
      const selection = window.getSelection();
      return selection ? selection.toString() : '';
    });

    expect(selectedText).toBe('');
  });
});
