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

  // Explícito, no heredado. El default de Playwright también son 30 s, pero
  // dejarlo implícito hace invisible el factor que multiplica todo lo de
  // abajo: el costo de una suite rota es `tests × intentos × este número`.
  timeout: 30_000,

  // Antes eran 2 (3 intentos por test). Los reintentos existen para la
  // inestabilidad —una animación, una carrera de red—, no para un fallo
  // determinista: si el test falla porque las credenciales no existen, va a
  // fallar las tres veces y sólo se paga el triple por la misma información.
  retries: process.env['CI'] ? 1 : 0,

  // En serie a propósito. Estos specs corren contra un staging COMPARTIDO y
  // crean incidencias y comentarios; en paralelo se pisarían entre sí y la
  // inestabilidad resultante se leería como fallo del producto.
  workers: process.env['CI'] ? 1 : undefined,

  // Corta a los 3 fallos en lugar de completar la matriz entera. Si la suite
  // está rota, se sabe en un minuto y no en diez, y el log queda legible: los
  // 15 fallos siguientes serían la misma causa repetida.
  maxFailures: process.env['CI'] ? 3 : 0,

  // El techo que faltaba. Sin esto NADA acota la corrida: el único límite era
  // el del job de GitHub Actions, 360 minutos por defecto. Una corrida se
  // quedó 9m44 reintentando fallos deterministas sin acercarse a terminar, y
  // nada la habría detenido.
  globalTimeout: process.env['CI'] ? 10 * 60 * 1000 : undefined,

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
