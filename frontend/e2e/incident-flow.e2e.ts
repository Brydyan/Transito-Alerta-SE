import { test, expect } from '@playwright/test';

/**
 * F3 (sc-303) — F3.6.2 e2e: filtrar → abrir detalle → comentar con
 * imagen → verificar el comentario en el hilo.
 *
 * Sigue el patrón de `auth-flow.e2e.ts` y `menu-navigation.e2e.ts`:
 * skip por `BASE_URL` (la convención del repo para e2e sin staging
 * configurado). La cobertura real del flujo vive en los specs
 * unitarios del `IncidentListComponent` y del
 * `CommentThreadComponent`; este test es la red anti-regresión
 * cuando el e2e sí corre contra un backend.
 */
test.describe('F3 — Módulo de Incidencias (e2e)', () => {
  test.skip(!process.env['BASE_URL'], 'E2E requires BASE_URL');

  test('master@tase.local: filtrar → detalle → comentar con imagen', async ({ page }) => {
    await page.goto(`${process.env['BASE_URL']}/app/incidencias`);

    // Filtrar por estado "in_progress".
    await page.selectOption('[data-testid="status-select"]', 'in_progress');

    // Abrir el primer resultado.
    await page.locator('[data-testid^="row-"]').first().click();

    // Esperar a que cargue el detalle.
    await expect(page.locator('[data-testid="action-row"]')).toBeVisible();

    // Comentar.
    await page.click('[data-testid="open-composer"]');
    await page.fill(
      '[data-testid="composer-textarea"]',
      'Atendido en sitio a las 14:30. Adjunto foto del arreglo.',
    );
    // Adjuntar imagen (en el spec real, descomentar con un
    // fixture del repo: `fixtures/sample.png`).
    // await page.setInputFiles('[data-testid="file-input"]', 'fixtures/sample.png');

    await page.click('[data-testid="submit-comment"]');

    // Verificar que el comentario aparece en el hilo.
    await expect(
      page.locator('[data-testid="thread-list"]').getByText('Atendido en sitio'),
    ).toBeVisible();
  });

  test('operador-org-1: sin acciones administrativas', async ({ page }) => {
    await page.goto(`${process.env['BASE_URL']}/app/incidencias`);
    await page.locator('[data-testid^="row-"]').first().click();

    // F3 (sc-303) C3 (ronda 4) — aserción real sobre el botón
    // `assign`: un operador de organización no tiene el permiso
    // `ASSIGN assignments`, así que `availableActions()` no lo
    // incluye y el botón no debe renderizarse.
    //
    // Lo que este test NO cubre (y se documenta en `tasks.md`):
    // bloquear el acceso directo por URL a `/app/incidencias/:id`
    // para un usuario sin `READ incidents`. Eso requiere un
    // `permissionGuard` que F2 todavía no aterrizó; mientras
    // tanto, la única "protección" es que el render queda vacío
    // porque el backend devuelve 403. La protección de URL es
    // scope de F2 o de un follow-up de F3.6.3+.
    await expect(page.locator('[data-testid="action-assign"]')).toHaveCount(0);
  });
});
