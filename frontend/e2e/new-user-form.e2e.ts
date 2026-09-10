import { test, expect, type Route } from '@playwright/test';

/**
 * NewUserFormComponent — F6 (`2026-09-08-f6-new-user-form`).
 *
 * Cubre los 5 scenarios del spec `admin-user-creation-form/spec.md`:
 *  S1: Pantalla carga, dropdowns poblados (mock 03-02)
 *  S2: Submit happy path crea usuario (POST + invite + navega)
 *  S3: Submit con email duplicado (409) muestra error
 *  S4: Foto se sube (POST /users + PATCH /:id/avatar)
 *  S5: Cancelar descarta cambios
 *
 * Sin backend real: skipea si no hay `BASE_URL`+`E2E_PASSWORD` (D4 del
 * change `e2e-test-user-and-credentials`). Los `page.route` mockean
 * los endpoints para validar el wire (snake_case en payloads, headers
 * correctos, etc.).
 */
const HAS_BACKEND = !!(process.env['BASE_URL']?.trim() && process.env['E2E_PASSWORD']?.trim());

/** Mínimo viable: 1 rol + 1 organización para que el dropdown se
 *  pueble y la tarjeta de preview se pueda renderizar. */
const fixtureFormData = {
  roles: [
    { id: 'r1', name: 'admin_org' },
    { id: 'r2', name: 'operador_org' },
  ],
  organizations: [{ id: 'o1', name: 'GAD Norte' }],
};

test.describe('NewUserForm (F6)', () => {
  test.skip(!HAS_BACKEND, 'Requiere staging con E2E_PASSWORD (cambio `e2e-test-user-and-credentials`).');

  test('S1 — Pantalla carga, dropdowns poblados', async ({ page }) => {
    await login(page);
    await page.route('**/api/users/form-data', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fixtureFormData),
      });
    });
    await page.goto('/app/admin/users/new');
    // El header del F0 (mock 03-02).
    await expect(page.getByRole('heading', { name: 'Nuevo Usuario' })).toBeVisible();
    await expect(page.getByText('GESTIÓN > USUARIOS > NUEVO REGISTRO')).toBeVisible();
    // 6 secciones del mock.
    await expect(page.getByTestId('section-profile')).toBeVisible();
    await expect(page.getByTestId('section-personal-data')).toBeVisible();
    await expect(page.getByTestId('section-organization')).toBeVisible();
    await expect(page.getByTestId('section-role-preview')).toBeVisible();
    await expect(page.getByTestId('section-geolocation')).toBeVisible();
    await expect(page.getByTestId('section-account-config')).toBeVisible();
    // Dropdowns poblados.
    const roleSelect = page.getByTestId('select-role');
    await expect(roleSelect).toBeEnabled();
    const options = await roleSelect.locator('option').allTextContents();
    expect(options).toContain('admin_org');
    expect(options).toContain('operador_org');
  });

  test('S2 — Submit happy path crea usuario + invite + navega', async ({ page }) => {
    await login(page);
    let postCalled = false;
    let inviteCalled = false;
    await page.route('**/api/users/form-data', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFormData) });
    });
    await page.route('**/api/users', async (route) => {
      if (route.request().method() === 'POST') {
        postCalled = true;
        const body = route.request().postDataJSON();
        // Wire: snake_case (D-frontend-4 + SnakeCaseResponseInterceptor).
        expect(body).toMatchObject({
          email: 'juan@municipio.gob.ec',
          first_name: 'Juan',
          last_name: 'Pérez',
          phone: '+593 99 999 9999',
        });
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'new-user', email: body.email }),
        });
        return;
      }
      await route.continue();
    });
    await page.route('**/api/admin/users/invite', async (route) => {
      inviteCalled = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'inv-1' }),
      });
    });
    await page.goto('/app/admin/users/new');
    await page.getByTestId('input-firstName').fill('Juan');
    await page.getByTestId('input-lastName').fill('Pérez');
    await page.getByTestId('input-email').fill('juan@municipio.gob.ec');
    await page.getByTestId('input-phone').fill('+593 99 999 9999');
    await page.getByTestId('submit-button').click();
    await expect(page).toHaveURL(/\/app\/admin\/users$/);
    expect(postCalled).toBe(true);
    expect(inviteCalled).toBe(true);
  });

  test('S3 — Email duplicado (409) muestra toast, no navega', async ({ page }) => {
    await login(page);
    await page.route('**/api/users/form-data', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFormData) });
    });
    await page.route('**/api/users', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'duplicate' }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/app/admin/users/new');
    await page.getByTestId('input-firstName').fill('Juan');
    await page.getByTestId('input-lastName').fill('Pérez');
    await page.getByTestId('input-email').fill('duplicado@municipio.gob.ec');
    await page.getByTestId('submit-button').click();
    // El toast de error debe mostrarse.
    await expect(page.getByText(/email ya registrado/i)).toBeVisible({ timeout: 3000 });
    // La pantalla NO navega.
    await expect(page).toHaveURL(/\/app\/admin\/users\/new$/);
  });

  test('S4 — Foto válida se sube (PATCH /:id/avatar)', async ({ page }) => {
    await login(page);
    let avatarUploadCalled = false;
    await page.route('**/api/users/form-data', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFormData) });
    });
    await page.route('**/api/users', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'u-photo' }),
        });
        return;
      }
      if (route.request().method() === 'PATCH' && route.request().url().includes('/avatar')) {
        avatarUploadCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'u-photo' }),
        });
        return;
      }
      await route.continue();
    });
    await page.route('**/api/admin/users/invite', async (route) => {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'inv-1' }) });
    });
    await page.goto('/app/admin/users/new');
    await page.getByTestId('input-firstName').fill('Juan');
    await page.getByTestId('input-lastName').fill('Pérez');
    await page.getByTestId('input-email').fill('photo@municipio.gob.ec');
    // Subir un JPG mínimo de 1×1. Array crudo de bytes — `Buffer`
    // y `atob` no están en los globals del eslint-config de e2e.
    const jpg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
      0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
      0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
      0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
      0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
      0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
      0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
      0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
      0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
      0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
      0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
      0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
      0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
      0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
      0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
      0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
      0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01,
      0x00, 0x00, 0x3f, 0x00, 0xfb, 0xd0, 0xff, 0xd9,
    ]);
    await page.getByTestId('avatar-upload').locator('input[type=file]').setInputFiles({
      name: 'avatar.jpg',
      mimeType: 'image/jpeg',
      buffer: jpg,
    });
    await page.getByTestId('submit-button').click();
    await expect(page).toHaveURL(/\/app\/admin\/users$/);
    expect(avatarUploadCalled).toBe(true);
  });

  test('S5 — Cancelar descarta (form sucio abre confirm)', async ({ page }) => {
    await login(page);
    await page.route('**/api/users/form-data', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFormData) });
    });
    await page.goto('/app/admin/users/new');
    await page.getByTestId('input-firstName').fill('Juan');
    await page.getByTestId('cancel-button').click();
    // Aparece el ConfirmDialog.
    await expect(page.getByText(/¿Descartar los cambios?/)).toBeVisible({ timeout: 3000 });
  });
});

/** Helper: login vía el helper de credenciales (D4 del change
 *  `e2e-test-user-and-credentials`). El usuario e2e tiene CREATE
 *  users + CREATE invitations por seed. */
async function login(page: import('@playwright/test').Page): Promise<void> {
  const { resolveE2eAdminCredentials } = await import('./_helpers/e2e-credentials');
  const creds = resolveE2eAdminCredentials();
  if (creds.skip) {
    throw new Error('login() llamado sin credenciales configuradas — el describe debería haber skipeado');
  }
  await page.goto('/login');
  await page.getByLabel(/usuario/i).fill(creds.user);
  await page.getByLabel(/contraseña|password/i).fill(creds.password);
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
  await page.waitForURL(/\/app\//, { timeout: 15_000 });
}
