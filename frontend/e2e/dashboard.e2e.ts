import { test, expect, type Route } from '@playwright/test';

/**
 * Dashboard rediseñado — F6 (`2026-09-08-f6-dashboard-redesign`).
 *
 * S1: la página carga, 5 KPI cards visibles.
 * S2: el formato del % change (+X% o -X%) refleja el wire.
 * S3: la actividad reciente muestra los items del feed.
 * S4: el chart semanal renderiza una columna por día.
 * S5: un fallo del backend enciende el banner de error y los
 *     bloques degradan a estado vacío.
 *
 * Sin backend real: el e2e sirve cuando `BASE_URL` apunta a
 * staging con `E2E_PASSWORD` configuradas; en otro caso se salta
 * con motivo (D4 del change `e2e-test-user-and-credentials`).
 *
 * Los escenarios que necesitan interceptar HTTP se montan vía
 * `page.route` cuando el escenario los requiere — el resto de
 * la suite no se interpone.
 */
const HAS_BACKEND = !!(process.env['BASE_URL']?.trim() && process.env['E2E_PASSWORD']?.trim());

test.describe('Dashboard rediseñado (F6)', () => {
  test.skip(!HAS_BACKEND, 'Requiere staging con E2E_PASSWORD (cambio `e2e-test-user-and-credentials`).');

  test('S1 — Dashboard carga con 5 KPI cards', async ({ page }) => {
    await login(page);
    await page.goto('/app/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // 5 tarjetas — `ui-kpi-card` se renderiza como contenedor con
    // `data-tone` y un label en versalitas.
    const kpis = page.locator('ui-kpi-card');
    await expect(kpis).toHaveCount(5);
    // Cada tarjeta muestra uno de los 5 nombres del mock 01-01.
    await expect(kpis.nth(0)).toContainText(/Total Incidencias/i);
    await expect(kpis.nth(1)).toContainText(/En proceso/i);
    await expect(kpis.nth(2)).toContainText(/Resueltas/i);
    await expect(kpis.nth(3)).toContainText(/Pendientes/i);
    await expect(kpis.nth(4)).toContainText(/Tiempo promedio/i);
  });

  test('S2 — % change muestra signo correcto', async ({ page }) => {
    await login(page);
    // Interceptamos stats con un valor conocido para validar el
    // formato del pie de tendencia.
    await page.route('**/api/incidents/stats', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 22,
          by_status: { pending: 9, in_progress: 7, resolved: 6, closed: 0 },
          by_priority: { critical: 0, high: 0, medium: 0, low: 0 },
          recent_count: 0,
          locations_count: 0,
          average_resolution_time: { formatted: '~13h', days: 0, hours: 13, seconds: 0 },
          trends: {
            total_pct: 8,           // positivo → "+8% VS. MES ANTERIOR"
            pendientes_pct: -5,      // negativo → "-5% VS. MES ANTERIOR"
            resolution_rate_pct: 67, // positivo → "+67% TASA DE RESOLUCIÓN"
          },
          top_categories: [],
        }),
      });
    });
    await page.goto('/app/dashboard');
    // El Total lleva el "+8%".
    const totalKpi = page.locator('ui-kpi-card').nth(0);
    await expect(totalKpi).toContainText(/\+8%/);
    // Pendientes lleva el "-5%".
    const pendingKpi = page.locator('ui-kpi-card').nth(3);
    await expect(pendingKpi).toContainText(/-5%/);
  });

  test('S3 — Actividad reciente muestra los items del feed', async ({ page }) => {
    await login(page);
    await page.route('**/api/incidents/feed**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'i1', title: 'A', status: 'pending', priority: 'critical', created_at: '2026-09-08T10:00:00Z', category: { id: 'c1', name: 'Baches' } },
            { id: 'i2', title: 'B', status: 'in_progress', priority: 'high', created_at: '2026-09-08T09:30:00Z', category: { id: 'c2', name: 'Agua' } },
            { id: 'i3', title: 'C', status: 'resolved', priority: 'medium', created_at: '2026-09-08T09:00:00Z', category: { id: 'c3', name: 'Alumbrado' } },
            { id: 'i4', title: 'D', status: 'closed', priority: 'low', created_at: '2026-09-08T08:00:00Z', category: { id: 'c4', name: 'Semáforos' } },
          ],
        }),
      });
    });
    await page.goto('/app/dashboard');
    const rows = page.locator('app-recent-activity li.row');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('Baches');
    await expect(rows.nth(3)).toContainText('Semáforos');
  });

  test('S4 — Chart semanal renderiza 7 columnas (una por día)', async ({ page }) => {
    await login(page);
    await page.route('**/api/incidents/weekly-stats', async (route: Route) => {
      const days = ['Mié', 'Jue', 'Vie', 'Sáb', 'Dom', 'Lun', 'Mar'];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          days: days.map((label, i) => ({
            date: `2026-09-0${2 + i}`,
            label,
            recibidas: i + 1,
            resueltas: i,
          })),
        }),
      });
    });
    await page.goto('/app/dashboard');
    const cols = page.locator('app-weekly-performance-chart li.day-col');
    await expect(cols).toHaveCount(7);
  });

  test('S5 — Error de stats enciende el banner y los bloques degradan', async ({ page }) => {
    await login(page);
    await page.route('**/api/incidents/stats', async (route: Route) => {
      await route.fulfill({ status: 500, body: 'boom' });
    });
    await page.goto('/app/dashboard');
    // El banner aparece (D5: la falla no aborta la página).
    await expect(page.locator('.error-banner')).toBeVisible();
    // El chart de top categorías, al no recibir data, muestra su
    // estado vacío en lugar de un lienzo en blanco.
    await expect(page.locator('app-top-categories-chart .empty-state')).toBeVisible();
  });
});

/** Helper: login vía la API del helper de credenciales. La
 *  función devuelve `{ user, password }` por compatibilidad con
 *  otros specs; este test no las usa. */
async function login(
  page: import('@playwright/test').Page,
): Promise<{ user: string; password: string }> {
  const { resolveE2eCredentials } = await import('./_helpers/e2e-credentials');
  const creds = resolveE2eCredentials();
  if (creds.skip) {
    throw new Error('login() llamado sin credenciales configuradas — el describe debería haber skipeado');
  }
  await page.goto('/login');
  await page.getByLabel(/usuario/i).fill(creds.user);
  await page.getByLabel(/contraseña|password/i).fill(creds.password);
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
  await page.waitForURL(/\/app\/dashboard/, { timeout: 15_000 });
  return { user: creds.user, password: creds.password };
}
