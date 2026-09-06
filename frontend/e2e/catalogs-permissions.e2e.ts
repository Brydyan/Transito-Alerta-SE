import { test, expect, Page } from '@playwright/test';

const BACKEND_URL = process.env['BASE_URL']?.trim();
const PASSWORD = 'ChangeMe!Demo2026';

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/usuario/i).fill(email);
  await page.getByLabel(/contraseña|password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
  await page.waitForURL(/\/app\/dashboard/, { timeout: 15_000 });
}

test.describe('F2.4.2 — Permisos de Catálogos (Guard & DOM)', () => {
  test.skip(
    !BACKEND_URL,
    'Requiere backend con seed (operador-org-1@tase.local). Definí BASE_URL apuntando a staging.',
  );

  test.beforeEach(async ({ page }) => {
    // This user lacks permission to create/edit Categories
    await login(page, 'operador-org-1@tase.local');
  });

  test('acciones de escritura no están en el DOM para usuarios sin permisos', async ({ page }) => {
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
    await page.goto('/app/categorias/new');
    
    // Should be redirected to dashboard
    await page.waitForURL(/\/app\/dashboard/);
    expect(page.url()).toContain('/app/dashboard');
  });
});
