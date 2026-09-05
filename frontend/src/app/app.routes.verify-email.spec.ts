import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * REG (sc-325) — Fix 9 (ronda 6): la ruta `/verify-email` TIENE
 * que existir en `app.routes.ts`. Es la defensa contra el
 * defecto de la B.6 original: la casilla se marcó cuando no
 * había componente, sólo un `.html` heredado de sc-117.
 *
 * El defecto se cazó por inspección humana (el verificador del
 * pass 5 abrió la carpeta y vio que faltaba el `.ts`). Este
 * spec es la red: si alguien borra la ruta, este test cae.
 *
 * Verificación por mutación (per verify-report):
 *  1. borrar la línea de la ruta → este spec debe fallar.
 *  2. cambiar `loadComponent` a un path inválido → la compilación
 *     del build cae.
 */
describe('app.routes.ts (REG sc-325 Fix 9 — verify-email existe)', () => {
  // Resolve from the spec's directory: app.routes.ts lives in
  // the same directory as this spec.
  const routesSrc = readFileSync(join(__dirname, 'app.routes.ts'), 'utf8');

  it('declarar `path: \'verify-email\'` en el árbol de rutas', () => {
    expect(routesSrc).toMatch(/path:\s*['"]verify-email['"]/);
  });

  it('la ruta carga el componente Angular standalone (no un `.html`/`.js` heredado)', () => {
    // La trampa del round 0 fue marcar la tarea con un `.html`
    // y un `.js` que ningún import traía al bundle. El contrato
    // aquí es: el loadComponent apunta a un `.ts` con un
    // `import('./.../verify-email.component')` que el compilador
    // puede resolver.
    expect(routesSrc).toMatch(
      /path:\s*['"]verify-email['"][\s\S]{0,500}verify-email\.component/,
    );
  });

  it('la ruta NO está bajo `authGuard` (debe ser guestGuard o sin guards)', () => {
    // La pantalla debe ser accesible sin sesión (es la página
    // post-alta; el ciudadano no tiene JWT aún). Si alguien la
    // mueve bajo `authGuard`, este test cae.
    const lines = routesSrc.split('\n');
    const idx = lines.findIndex((l) => l.includes("'verify-email'"));
    expect(idx).toBeGreaterThan(-1);
    // La línea siguiente con `canActivate:` o `canMatch:` debe
    // ser `guestGuard` (no `authGuard`).
    const canActivateLine = lines
      .slice(idx, idx + 4)
      .find((l) => /canActivate|canMatch/.test(l));
    if (canActivateLine) {
      expect(canActivateLine).toMatch(/guestGuard/);
      expect(canActivateLine).not.toMatch(/authGuard/);
    }
  });
});
