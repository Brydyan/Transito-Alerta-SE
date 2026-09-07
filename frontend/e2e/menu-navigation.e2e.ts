import { test, expect, Page } from '@playwright/test';

import { resolveE2eAdminCredentials, resolveE2eCredentials } from './_helpers/e2e-credentials';

/**
 * F1 (F1.6.1 + F1.6.2) — e2e: el sidebar no debe llevar a `ErrorPageComponent`.
 *
 * Defecto confirmado por la auditoría de F0 (2026-09-01): el menú
 * `GET /api/menus/my` devolvía rutas que no existían en `app.routes.ts`,
 * y cada clic resolvía contra `path: '**'` → `ErrorPageComponent`.
 * F1 alinea el mapa y registra placeholders; este e2e es la red que
 * afirma que ningún item del menú aterriza en el 404.
 *
 * 3rd pass (`2026-09-03-e2e-test-user-and-credentials`): las
 * credenciales vienen del helper.
 *  - F1.6.1 necesita ver TODOS los ítems del menú — usa el perfil
 *    admin (master@tase.local), que es el único sembrado con la
 *    matriz completa de permisos.
 *  - F1.6.2 necesita ver el subconjunto del operador — usa el
 *    usuario e2e (operador_org), que es el sembrado por la fase y
 *    atraviesa los guards como un usuario real. Antes usaba
 *    `operador-org-1@tase.local`; el rol es el mismo, pero el e2e
 *    tiene credenciales que viven en un secret, no en la cabeza
 *    del operador — y se evita el acoplamiento de rotar la
 *    contraseña humana rompa CI.
 *
 * B.8 — el aserto de F1.6.2 sigue siendo coherente: el usuario e2e
 * es `operador_org`, ve el mismo subconjunto que `operador-org-1`,
 * así que la lista de ítems visibles no cambia.
 */

const adminCreds = resolveE2eAdminCredentials();
const e2eCreds = resolveE2eCredentials();

async function login(page: Page, user: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/usuario/i).fill(user);
  await page.getByLabel(/contraseña|password/i).fill(password);
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

test.describe('F1.6.1 — sidebar del admin navega sin 404', () => {
  test.skip(adminCreds.skip, adminCreds.skip ? adminCreds.reason : '');

  test('cada entrada del menú no monta ErrorPageComponent', async ({ page }) => {
    if (adminCreds.skip) return;
    await login(page, adminCreds.user, adminCreds.password);

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
  test.skip(e2eCreds.skip, e2eCreds.skip ? e2eCreds.reason : '');

  test('el menú reducido sigue siendo navegable en su totalidad', async ({ page }) => {
    if (e2eCreds.skip) return;
    await login(page, e2eCreds.user, e2eCreds.password);

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
