import { test, expect } from '@playwright/test';

/**
 * F1 — auth-flow.e2e.ts
 * Change `2026-08-28-sc-203-auth-comments-backend-integration`.
 *
 * End-to-end smoke test for the login flow. Asserts:
 *  1. The login form calls the real `POST /auth/login` (not a mock).
 *  2. On success the user lands on the dashboard and the header
 *     shows the user name.
 *
 * Required environment:
 *  - `BASE_URL` points at an Angular app that proxies to a real
 *    NestJS backend (default: `http://localhost:4200` + dev proxy).
 *  - The seed includes a valid `admin@correo.com` / `123456` user
 *    (T3.6 / seed-data pipeline). If the backend is fresh, run
 *    `pnpm run db:seed` first.
 */
test.describe('Auth flow', () => {
  test('F1.1: admin login → dashboard', async ({ page }) => {
    // Capture every network call so we can assert the real endpoint fired.
    const loginRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/auth/login')) {
        loginRequests.push(req.url());
      }
    });

    await page.goto('/auth/login');
    await page.getByLabel(/email/i).fill('admin@correo.com');
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
