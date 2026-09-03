import { test, expect, Page } from '@playwright/test';

/**
 * F1 (F1.6.1 + F1.6.2) — e2e: el sidebar no debe llevar a `ErrorPageComponent`.
 *
 * Defecto confirmado por la auditoría de F0 (2026-09-01): el menú
 * `GET /api/menus/my` devolvía rutas que no existían en `app.routes.ts`,
 * y cada clic resolvía contra `path: '**'` → `ErrorPageComponent`.
 * F1 alinea el mapa y registra placeholders; este e2e es la red que
 * afirma que ningún item del menú aterriza en el 404.
 *
 * Sin backend real no se puede autenticar; el spec se salta si
 * `BASE_URL` no está definido (mismo patrón que `auth-flow.e2e.ts`).
 *
 * Credenciales del seed (`database/seeds/users.js`):
 *   - master@tase.local / ChangeMe!Demo2026 → 35 permisos, ve los 10 ítems
 *   - operador-org-1@tase.local / ChangeMe!Demo2026 → 15 permisos, subconjunto
 */
const BACKEND_URL = process.env['BASE_URL']?.trim();
const PASSWORD = 'ChangeMe!Demo2026';

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/usuario/i).fill(email);
  await page.getByLabel(/contraseña|password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
  // El redirect a /app/dashboard es la señal de que el login pegó.
  await page.waitForURL(/\/app\/dashboard/, { timeout: 15_000 });
}

async function clickSidebarItem(page: Page, name: string): Promise<void> {
  // El sidebar renderiza cada item con su `name` (label del backend).
  // Usamos `getByRole('link', { name })` para no confundirnos con el
  // nombre de la sección (que es `group` en backend, mayúsculas, sin
  // link propio).
  const link = page.getByRole('link', { name: new RegExp(`^${name}$`, 'i') }).first();
  await link.click();
  // Cada item de menú navega dentro de /app/* — esperamos a que la URL
  // cambie del dashboard antes de afirmar.
  await page.waitForURL((url) => !url.pathname.endsWith('/app/dashboard'), { timeout: 5_000 });
}

async function assertNotErrorPage(page: Page, itemName: string): Promise<void> {
  // CRITICAL-1 quedó cerrado con `withComponentInputBinding()` + data
  // en `app.routes.ts`, pero la aserción negativa ("no aparece el
  // heading de error") no detecta un componente que revienta al
  // montarse: deja el `<router-outlet>` vacío sin pintar el 404, y
  // `isVisible().catch(() => false)` reporta `false`, el test pasa
  // y la regresión es invisible. La red robusta es **positiva**:
  // el outlet debe tener contenido renderizado por la ruta.
  //
  // `router-outlet` no expone su contenido como sibling directo en
  // todas las versiones de Angular; el contrato real es "el primer
  // hijo del outlet o, si no hay, el contenedor más cercano tiene
  // contenido". Probamos ambas formas.
  const outletContent = await page.evaluate(() => {
    const outlet = document.querySelector('router-outlet');
    if (!outlet) return null;
    // El contenido del outlet se renderiza como siguiente sibling.
    let el: Element | null = outlet.nextElementSibling;
    if (!el) {
      // Algunas versiones montan dentro del outlet.
      el = outlet;
    }
    return (el.textContent || '').trim().length;
  });
  expect(
    outletContent,
    `clic en "${itemName}" no renderizó contenido en el router-outlet`,
  ).toBeGreaterThan(0);

  // Mantenemos también la aserción negativa original como belt-and-suspenders.
  const errorHeading = page.getByRole('heading', { name: /error|404|no encontrad/i });
  const isError = await errorHeading.isVisible().catch(() => false);
  expect(isError, `clic en "${itemName}" llevó a ErrorPageComponent`).toBe(false);
}

test.describe('F1.6.1 — sidebar del master navega sin 404', () => {
  test.skip(
    !BACKEND_URL,
    'Requiere backend con seed (master@tase.local). Definí BASE_URL apuntando a staging.',
  );

  test('cada entrada del menú no monta ErrorPageComponent', async ({ page }) => {
    await login(page, 'master@tase.local');

    // Las 10 entradas que el mapa D4 emite para un usuario con todos
    // los permisos del menú. El orden es el del backend (`order`).
    const items = [
      'Dashboard',
      'Inicio',
      'Lista de Incidencias',
      'Mapa',
      'Reportar',
      'Usuarios',
      'Roles',
      'Organizaciones',
      'Categorías',
      'Ubicaciones',
    ];

    for (const name of items) {
      // Volvemos al dashboard entre clics para que el sidebar esté en
      // estado conocido.
      await page.goto('/app/dashboard');
      await page.waitForLoadState('networkidle');
      await clickSidebarItem(page, name);
      await assertNotErrorPage(page, name);
    }
  });
});

test.describe('F1.6.2 — operador_org ve un subconjunto navegable', () => {
  test.skip(
    !BACKEND_URL,
    'Requiere backend con seed (operador-org-1@tase.local). Definí BASE_URL apuntando a staging.',
  );

  test('el menú reducido sigue siendo navegable en su totalidad', async ({ page }) => {
    await login(page, 'operador-org-1@tase.local');

    // El operador de organización NO ve Usuarios, Roles, Categorías
    // ni Ubicaciones (los permisos de esos recursos no están en su
    // rol). Lo que sí ve debe responder sin 404.
    const visibleItems = ['Dashboard', 'Inicio', 'Lista de Incidencias', 'Mapa', 'Reportar'];

    for (const name of visibleItems) {
      await page.goto('/app/dashboard');
      await page.waitForLoadState('networkidle');
      await clickSidebarItem(page, name);
      await assertNotErrorPage(page, name);
    }
  });
});
