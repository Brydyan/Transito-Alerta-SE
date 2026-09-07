import { test, expect } from '@playwright/test';

import { resolveE2eCredentials } from './_helpers/e2e-credentials';

/**
 * F1 — auth-flow.e2e.ts
 * Change `2026-08-28-sc-203-auth-comments-backend-integration`.
 *
 * 2nd pass: corrected selectors + route to match the real DOM/routing
 * (change `2026-08-28-sc-208-frontend-e2e-tests-quick-fix`).
 *  - route: `/auth/login` → `/login` (the real route per
 *    `frontend/src/app/app.routes.ts:12`).
 *  - email label: the form uses `Usuario` as the visible label
 *    (`login.component.html:52`) — `getByLabel(/email/i)` returned 0
 *    matches and timed out. Use `/usuario/i`.
 *  - password label: keep `/contraseña|password/i` (the component
 *    uses `Contraseña`).
 *  - login button: keep `/entrar|iniciar|login/i`.
 *
 * 3rd pass (`2026-09-03-e2e-test-user-and-credentials`): el usuario
 * pasó de `admin@correo.com`/`123456` (credenciales heredadas de
 * GeoReporta, sin sembrar) a `e2e@tase.local` con la contraseña que
 * el runner recibe como `E2E_PASSWORD` secret. El helper
 * `_helpers/e2e-credentials.ts` distingue "no configurado" (skip) de
 * "configurado y roto" (falla) — ver D4 del change.
 *
 * Required environment (consumido por el helper):
 *  - `BASE_URL` apunta a un Angular que proxia a un NestJS real.
 *  - `E2E_PASSWORD` es el secret del runner; sin él la suite falla.
 *  - `E2E_USER` es opcional; default `e2e@tase.local` (operador_org).
 *
 * Si el backend es fresco, `pnpm run db:seed` siembra los seis de demo
 * Y al usuario e2e — este último sólo cuando `E2E_PASSWORD` está
 * definida al momento del seed.
 */

const creds = resolveE2eCredentials();

test.describe('Auth flow', () => {
  test.skip(creds.skip, creds.skip ? creds.reason : '');

  test('F1.1: e2e login → dashboard', async ({ page }) => {
    if (creds.skip) return; // narrowing — `test.skip` no estrecha tipos

    // Capture every network call so we can assert the real endpoint fired.
    const loginRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/auth/login')) {
        loginRequests.push(req.url());
      }
    });

    await page.goto('/login');
    await page.getByLabel(/usuario/i).fill(creds.user);
    await page.getByLabel(/contraseña|password/i).fill(creds.password);
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    // The login should land on /app/dashboard (route defined in
    // the LoginComponent — change if your routing differs).
    await page.waitForURL(/\/app\/dashboard/, { timeout: 10_000 });

    // Verify the auth endpoint was actually called (not mocked).
    expect(loginRequests.length).toBeGreaterThan(0);
    expect(loginRequests[0]).toMatch(/\/auth\/login$/);

    // The header should show the seeded user name. El usuario e2e
    // se llama «E2E Test» (database/seeds/users.js, E2E_USER); el
    // header de la app muestra nombre + apellido, así que alcanza
    // con buscar «E2E» o «Test».
    await expect(page.getByRole('banner')).toContainText(/E2E|Test/i);
  });
});
