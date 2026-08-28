import { test, expect } from '@playwright/test';

/**
 * F2 — comment-flow.e2e.ts
 * Change `2026-08-28-sc-203-auth-comments-backend-integration`.
 *
 * End-to-end smoke test for comment CRUD. Asserts:
 *  - After login, the incident detail page loads the comments.
 *  - Adding a comment posts to `/comments` (not the old nested path)
 *    and the new comment appears in the list.
 *
 * Required environment:
 *  - The seed includes a valid `admin@correo.com` / `123456` user.
 *  - A valid incident exists at `/incidents/<id>` (the hardcoded
 *    `INCIDENT_ID` below must be present in the seed data).
 */
const ADMIN_EMAIL = 'admin@correo.com';
const ADMIN_PASSWORD = '123456';
const INCIDENT_ID = '123'; // TODO: replace with a real seed id before running

test.describe('Comment flow', () => {
  test('F2.1: login → open incident → add comment', async ({ page }) => {
    const createRequests: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith('/comments')) {
        createRequests.push(req.url());
      }
    });

    // Login (reuses F1's path).
    await page.goto('/auth/login');
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/contraseña|password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
    await page.waitForURL(/\/app\/dashboard/, { timeout: 10_000 });

    // Open the incident detail.
    await page.goto(`/incidents/${INCIDENT_ID}`);

    // Wait for the comments section to be present (selector may
    // need adjustment if your component uses a different class).
    await page.waitForSelector('[data-testid="comments-section"]', { timeout: 10_000 });

    // Type and submit a comment.
    const COMMENT_TEXT = 'Test comment from E2E';
    await page.getByPlaceholder(/escribe|comenta|comment/i).fill(COMMENT_TEXT);
    await page.getByRole('button', { name: /comentar|enviar|add/i }).click();

    // The new comment should appear within 2s (optimistic update).
    await expect(page.getByText(COMMENT_TEXT)).toBeVisible({ timeout: 2_000 });

    // Verify the request hit the right endpoint.
    expect(createRequests.length).toBeGreaterThan(0);
    expect(createRequests[0]).toMatch(/\/comments$/);
  });
});
