import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * REG (sc-325) — C.7 spec de la ruta `/verificar` (composer del
 * OTP). Es la red contra el defecto que el grupo C viene a
 * cerrar: un `verify-otp.component.ts` que existe pero una ruta
 * que apunta a otra cosa (o a nada) deja al reportero sin poder
 * verificar. C.3 y C.4 se completan juntas, y este spec las
 * conecta: el componente se monta **porque** la ruta existe
 * y **porque** está bajo `authGuard`.
 *
 * Verificación por mutación (per verify-report):
 *  1. borrar la línea de la ruta → los tres tests caen.
 *  2. cambiar el path a `verify-otp` (sin slash) → el primer
 *     test cae.
 *  3. cambiar `authGuard` por `guestGuard` (o quitarlo) → el
 *     tercer test cae. Esa es la red específica para C.4: la
 *     redirección del login sólo se justifica si la ruta está
 *     bajo `authGuard`.
 */
describe('app.routes.ts (REG sc-325 C.7 — verificar existe bajo authGuard)', () => {
  const routesSrc = readFileSync(join(__dirname, 'app.routes.ts'), 'utf8');

  it("declarar `path: 'verificar` en el árbol de rutas", () => {
    expect(routesSrc).toMatch(/path:\s*['"]verificar['"]/);
  });

  it('la ruta carga el componente standalone (no un `.html`/`.js` heredado)', () => {
    // C.3: el contrato es que el loadComponent apunta al
    // `.component.ts` (con decorador y export del `class`).
    // Cualquier import a un `.html` o `.js` heredado sería
    // exactamente la regresión de B.6 (Fix 9) — un componente
    // que existe en disco pero que el compilador no trae al
    // bundle.
    expect(routesSrc).toMatch(
      /path:\s*['"]verificar['"][\s\S]{0,500}verify-otp\.component/,
    );
  });

  it('la ruta SÍ está bajo `authGuard` (composer requiere JWT)', () => {
    // C.3/C.4: el composer sólo se monta con sesión. Si la
    // ruta queda bajo `guestGuard` o sin guards, un visitante
    // anónimo podría abrirla — pero los endpoints del OTP
    // están bajo `JwtAuthGuard` y devolverían 401, así que
    // la pantalla mostraría un fallo confuso en vez del
    // login. La política es: el guard de ruta decide
    // "tenés sesión", y el `LoginComponent` (C.4) decide
    // "además tu correo no está verificado".
    const lines = routesSrc.split('\n');
    const idx = lines.findIndex((l) => l.includes("'verificar'"));
    expect(idx).toBeGreaterThan(-1);
    const canActivateLine = lines
      .slice(idx, idx + 8)
      .find((l) => /canActivate|canMatch/.test(l));
    expect(canActivateLine).toBeDefined();
    expect(canActivateLine).toMatch(/authGuard/);
    expect(canActivateLine).not.toMatch(/guestGuard/);
  });
});
