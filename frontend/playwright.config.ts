import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — T8/SC-203 auth & comments e2e smoke tests.
 *
 * `webServer` boots the Angular dev server before the suite starts
 * and tears it down at the end. Override `BASE_URL` to point at a
 * real environment (staging/production) — the default points at
 * the local dev server which proxies to NestJS on :3001.
 */

/**
 * Una `BASE_URL` vacía cuenta como ausente.
 *
 * El job `frontend-e2e` de `ci.yml` exporta `BASE_URL: ${{ vars.STAGING_BASE_URL }}`.
 * Cuando esa variable de repositorio no está definida, GitHub no omite el env:
 * lo exporta como **cadena vacía**. Antes las dos expresiones de abajo la
 * trataban distinto — `baseURL` usaba `??`, que sólo cae en null/undefined, y
 * `webServer` usaba truthiness. Resultado: el dev server arrancaba en :4200
 * pero `baseURL` quedaba en `''`, y toda navegación relativa moría con
 * `Protocol error (Page.navigate): Cannot navigate to invalid URL`.
 *
 * Normalizar acá una sola vez mantiene ambas decisiones de acuerdo.
 */
const EXTERNAL_BASE_URL = process.env['BASE_URL']?.trim() || undefined;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: EXTERNAL_BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: EXTERNAL_BASE_URL
    ? undefined
    : {
        command: 'pnpm start',
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
});
