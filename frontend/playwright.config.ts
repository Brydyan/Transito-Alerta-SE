import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — T8/SC-203 auth & comments e2e smoke tests.
 *
 * `webServer` boots the Angular dev server before the suite starts
 * and tears it down at the end. Override `BASE_URL` to point at a
 * real environment (staging/production) — the default points at
 * the local dev server which proxies to NestJS on :3001.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env['BASE_URL']
    ? undefined
    : {
        command: 'pnpm start',
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
});
