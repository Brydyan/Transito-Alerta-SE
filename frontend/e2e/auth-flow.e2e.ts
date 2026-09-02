import { test, expect } from '@playwright/test';

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
 * Required environment:
 *  - `BASE_URL` points at an Angular app that proxies to a real
 *    NestJS backend (default: `http://localhost:4200` + dev proxy).
 *  - The seed includes a valid `admin@correo.com` / `123456` user
 *    (T3.6 / seed-data pipeline). If the backend is fresh, run
 *    `pnpm run db:seed` first.
 */
/**
 * Este spec necesita un backend real: hace login con credenciales sembradas
 * y afirma que la petición salió de verdad (`not mocked`). Sin backend, el
 * POST a /api/auth/login muere en el proxy del dev server y la navegación a
 * /app/dashboard nunca ocurre.
 *
 * `accept-invitation.e2e.ts` y `comment-flow.e2e.ts` ya estaban saltados por
 * este mismo motivo, con un TODO a mano. Este archivo tenía el requisito
 * declarado en su docblock y se había quedado corriendo igual — la regla
 * aplicada en dos de tres archivos.
 *
 * En vez de otro `test.skip()` a mano, la condición se hace explícita: sin
 * `BASE_URL` no hay backend que valga, y con ella el test se activa solo.
 * Así el motivo queda verificado por la máquina en lugar de recordado en un
 * comentario, y no hay que acordarse de "des-saltarlo" el día que exista el
 * entorno.
 *
 * OJO: esto vuelve honesto al gate, no lo convierte en gate. Mientras
 * `vars.STAGING_BASE_URL` siga sin configurarse, el job pasa sin probar el
 * login — que es justo lo que SC-208 advertía. La solución real es apuntar
 * BASE_URL a staging o levantar el backend en CI.
 */
const BACKEND_URL = process.env['BASE_URL']?.trim();

test.describe('Auth flow', () => {
  // A nivel de describe, no dentro del test: acá la condición se evalúa antes
  // de que se instancien los fixtures, así que ni siquiera se levanta el
  // browser. Dentro del test, `page` se resuelve primero y el skip llega tarde.
  test.skip(
    !BACKEND_URL,
    'Requiere un backend real con seed (admin@correo.com). Definí BASE_URL apuntando a staging.',
  );

  test('F1.1: admin login → dashboard', async ({ page }) => {

    // Capture every network call so we can assert the real endpoint fired.
    const loginRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/auth/login')) {
        loginRequests.push(req.url());
      }
    });

    await page.goto('/login');
    await page.getByLabel(/usuario/i).fill('admin@correo.com');
    await page.getByLabel(/contraseña|password/i).fill('123456');
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    // The login should land on /app/dashboard (route defined in
    // the LoginComponent — change if your routing differs).
    await page.waitForURL(/\/app\/dashboard/, { timeout: 10_000 });

    // Verify the auth endpoint was actually called (not mocked).
    expect(loginRequests.length).toBeGreaterThan(0);
    expect(loginRequests[0]).toMatch(/\/auth\/login$/);

    // The header should show the seeded user name.
    await expect(page.getByRole('banner')).toContainText(/admin/i);
  });
});
