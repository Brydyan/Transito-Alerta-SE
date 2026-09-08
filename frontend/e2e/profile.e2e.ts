import { test, expect, type Route } from '@playwright/test';

/**
 * Profile rediseñado — F6 (`2026-09-08-f6-perfil-redesign`).
 *
 * Cubre S1-S7 del spec:
 *  S1: Profile loads, fields pre-populated
 *  S2: Edit name, save, verify update
 *  S3: Validation (name required)
 *  S4: Phone format (auto-applied — verificado via form, no máscara)
 *  S5: Upload photo (select file, preview)
 *  S6: Error handling (500)
 *  S7: Email readonly (cannot edit)
 *
 * Sin backend real: skipea sin `BASE_URL`+`E2E_PASSWORD` (D4).
 */
const HAS_BACKEND = !!(process.env['BASE_URL']?.trim() && process.env['E2E_PASSWORD']?.trim());

const fixtureUser = {
  usuarioId: 1,
  nombres: 'Juan',
  apellidos: 'Pérez',
  email: 'juan@test.com',
  telefono: '+593991234567',
  rol: { rolId: 1, nombre: 'ADMIN ORG' },
  avatar: { url: 'https://cdn.example.com/avatar.jpg' },
};

test.describe('Profile rediseñado (F6)', () => {
  test.skip(!HAS_BACKEND, 'Requiere staging con E2E_PASSWORD.');

  test('S1 — Profile loads con fields pre-populated', async ({ page }) => {
    await login(page);
    await page.route('**/api/users/1', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureUser) });
    });
    await page.goto('/app/profile');
    await expect(page.getByRole('heading', { name: 'Mi Perfil' })).toBeVisible();
    await expect(page.locator('#prof-nombres')).toHaveValue('Juan');
    await expect(page.locator('#prof-apellidos')).toHaveValue('Pérez');
    await expect(page.locator('#prof-telefono')).toHaveValue('+593991234567');
  });

  test('S2 — Edit nombre + save muestra toast "Perfil actualizado"', async ({ page }) => {
    await login(page);
    await page.route('**/api/users/1', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureUser) });
    });
    let patchCalled = false;
    await page.route('**/api/users/me', async (route: Route) => {
      if (route.request().method() === 'PATCH') {
        patchCalled = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureUser) });
        return;
      }
      await route.continue();
    });
    await page.goto('/app/profile');
    await page.locator('#prof-nombres').fill('Juan Carlos');
    await page.getByRole('button', { name: /guardar cambios/i }).click();
    await expect(page.getByText(/perfil actualizado correctamente/i)).toBeVisible({ timeout: 5000 });
    expect(patchCalled).toBe(true);
  });

  test('S3 — Validación: nombres requerido', async ({ page }) => {
    await login(page);
    await page.route('**/api/users/1', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureUser) });
    });
    await page.goto('/app/profile');
    await page.locator('#prof-nombres').fill('');
    await page.getByRole('button', { name: /guardar cambios/i }).click();
    // No debe navegar ni mostrar toast de éxito.
    await expect(page).toHaveURL(/\/app\/profile/);
    // El mensaje de error inline se muestra.
    await expect(page.getByText(/nombres son obligatorios/i)).toBeVisible();
  });

  test('S4 — Formato de teléfono validado por el ecuadorPhoneValidator', async ({ page }) => {
    await login(page);
    await page.route('**/api/users/1', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureUser) });
    });
    await page.goto('/app/profile');
    await page.locator('#prof-telefono').fill('12345');
    await page.locator('#prof-telefono').blur();
    await expect(page.getByText(/debe empezar con \+593 o 09/i)).toBeVisible();
  });

  test('S5 — Upload photo: select file actualiza preview', async ({ page }) => {
    await login(page);
    await page.route('**/api/users/1', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureUser) });
    });
    await page.goto('/app/profile');
    // El input file está oculto, pero es accesible por label.
    const fileInput = page.locator('input[type="file"]');
    // Crear un buffer JPEG mínimo (no necesitamos bytes válidos
    // para el preview de data-URL; FileReader lee lo que sea).
    const buffer = globalThis.Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await fileInput.setInputFiles({
      name: 'avatar.jpg',
      mimeType: 'image/jpeg',
      buffer,
    });
    // El preview se actualiza a una data:URL.
    await expect(page.locator('app-profile-photo-uploader img.avatar-img')).toBeVisible({ timeout: 3000 });
  });

  test('S6 — 500 en PATCH muestra toast de error', async ({ page }) => {
    await login(page);
    await page.route('**/api/users/1', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureUser) });
    });
    await page.route('**/api/users/me', async (route: Route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 500, body: 'boom' });
        return;
      }
      await route.continue();
    });
    await page.goto('/app/profile');
    await page.getByRole('button', { name: /guardar cambios/i }).click();
    await expect(page.getByText(/error al actualizar el perfil/i)).toBeVisible({ timeout: 5000 });
  });

  test('S7 — Email es readonly', async ({ page }) => {
    await login(page);
    await page.route('**/api/users/1', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureUser) });
    });
    await page.goto('/app/profile');
    const email = page.locator('#prof-email');
    await expect(email).toHaveAttribute('readonly', '');
    await expect(email).toBeDisabled();
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
