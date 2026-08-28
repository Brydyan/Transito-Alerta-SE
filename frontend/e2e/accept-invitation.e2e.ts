import { test, expect } from '@playwright/test';

/**
 * SC-207 — accept-invitation smoke e2e.
 *
 * Skipped (same reason as `comment-flow.e2e.ts`): requires a real
 * invitation token from a running backend. The form's render-only
 * assertions (no submit) are useful as a regression net for the
 * route wiring — that's why we don't just delete the file.
 *
 * TODO(sc-207 + sc-208): unskip when an end-to-end test backend
 * with a seeded invitation is available in CI (out of scope for
 * this change — the invitation seed pipeline is a separate feature).
 */
test.describe('Accept invitation', () => {
  test.skip('SC-207.5: visiting /accept-invitation?token=… renders the form', async ({ page }) => {
    await page.goto('/accept-invitation?token=fake-invitation-token');
    await expect(page.getByText(/aceptar invitación/i)).toBeVisible();
    await expect(page.getByLabel(/contraseña/i)).toBeVisible();
  });

  test.skip('SC-207.6: visiting /accept-invitation without a token shows the "missing invitation" banner', async ({ page }) => {
    await page.goto('/accept-invitation');
    await expect(page.getByText(/requiere un enlace de invitación/i)).toBeVisible();
    // The submit button must be disabled when no token is present.
    await expect(page.getByRole('button', { name: /crear cuenta/i })).toBeDisabled();
  });
});
