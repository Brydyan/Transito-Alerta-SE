import * as fs from 'node:fs';
import * as path from 'node:path';

import { MENU_MAP } from './menu-map';

/**
 * F1 (D6) — Test de coherencia entre `MENU_MAP` y las rutas que
 * `frontend/src/app/app.routes.ts` realmente expone. Es el entregable
 * duradero de la fase: sin él, el menú puede volver a divergir del
 * enrutado en cuanto alguien renombre o retire una ruta.
 *
 * ## Estrategia (ronda 3)
 *
 * El test lee `app.routes.ts` desde disco y extrae todos los
 * `path: '...'` declarados. Compara cada ruta de `MENU_MAP`
 * descomponiéndola en segmentos y exigiendo que cada uno esté
 * presente en el archivo. **No hay lista hand-maintained de
 * respaldo** (CRITICAL-2 de la ronda 1 quedó cerrado en la ronda 2
 * con la lectura del archivo real; la ronda 3 lo refuerza eliminando
 * el `KNOWN_APP_ROUTES` que en la ronda 2 podía usarse como bypass:
 * agregar una ruta a la lista eximía su verificación del archivo).
 *
 * ## Limitación conocida (SUGGESTION de la ronda 2)
 *
 * El parser extrae los literales `path: '...'` como un set plano.
 * La composición padre-hijo no se reconstruye: si dos segmentos
 * existen en puntos no relacionados del árbol (p. ej. `organizaciones`
 * suelto y `admin` suelto sin que exista `/organizaciones/admin`),
 * la validación pasa igual. La corrección completa es parsear la
 * jerarquía real con un walker; está listada como follow-up.
 *
 * Para los 10 pares vigentes hoy, el check es suficiente: las
 * combinaciones reales no tienen colisiones de segmentos entre
 * rutas no relacionadas.
 *
 * ## Para agregar una ruta
 *
 *  1. Agregar la entrada en `MENU_MAP` (con su `requires` y su
 *     `group`/`order`).
 *  2. Registrar el destino en `app.routes.ts` — como componente real
 *     si la pantalla existe, o como `PlaceholderComponent` con el
 *     comentario `// PLACEHOLDER F<n>` mientras tanto.
 *  3. Correr este test. Si la ruta tiene segmentos parametrizados
 *     (`:id`, `:rolId`), el segmento `:` se filtra antes de la
 *     verificación; los segmentos literales padre (ej. `admin`,
 *     `users`, `edit`) sí se validan contra `app.routes.ts`.
 *
 * Si `MENU_MAP` referencia una ruta que no está en `app.routes.ts`,
 * este test falla con el nombre de la entrada ofensora y los
 * segmentos ausentes.
 */

// ──────────────────────────────────────────────────────────────────────────
//  Parser del archivo de rutas (CRITICAL-2 fix)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Lee `frontend/src/app/app.routes.ts` y devuelve el conjunto de
 * segmentos `path` declarados como literales.
 *
 * Implementación: extracción de literales `path: '...'` y `path: "..."`.
 * No intenta re-construir la jerarquía padre-hijo (ver docblock del
 * spec, "Limitación conocida").
 *
 * Falla loudly si el archivo no se puede leer: el error apunta al
 * path calculado, no a un genérico "no se encontró".
 */
function readAppRoutesSegments(): Set<string> {
  const routesPath = path.resolve(
    __dirname,
    '../../../../frontend/src/app/app.routes.ts',
  );
  let src: string;
  try {
    src = fs.readFileSync(routesPath, 'utf8');
  } catch (err) {
    throw new Error(
      `menu-map.spec.ts: no se pudo leer ${routesPath}. ` +
        `Esperado: app.routes.ts del frontend. Error: ${(err as Error).message}`,
    );
  }

  const segments = new Set<string>();
  const re = /path:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    segments.add(m[1]);
  }
  return segments;
}

/**
 * Concatena el prefijo `/app` a una ruta de `MENU_MAP`. Replica la
 * convención de `MenuService.formatRoutes()` en el frontend.
 */
function withAppPrefix(route: string): string {
  if (route.startsWith('/app')) return route;
  return `/app${route.startsWith('/') ? '' : '/'}${route}`;
}

describe('MENU_MAP coherence with app routes (F1, D6)', () => {
  it('CRITICAL-2: every MENU_MAP route resolves to segments declared in app.routes.ts', () => {
    // El test lee el archivo real. Si app.routes.ts no se puede
    // parsear, el readAppRoutesSegments() lanza con un mensaje útil.
    const declared = readAppRoutesSegments();

    const offenders: Array<{
      label: string;
      route: string;
      full: string;
      missing: string[];
    }> = [];

    for (const [label, definition] of Object.entries(MENU_MAP)) {
      const full = withAppPrefix(definition.route);

      // Cada segmento del path (sin los `:`) debe estar declarado en
      // `app.routes.ts`. Esto cubre el caso de eliminar una ruta del
      // frontend sin tocar el backend, y el caso inverso (ruta
      // fantasma agregada al backend). Como `KNOWN_APP_ROUTES` ya
      // no existe, no hay bypass posible: la única forma de
      // eximir una entrada es borrarla del MENU_MAP.
      const segments = full
        .split('/')
        .filter((s) => s.length > 0 && !s.startsWith(':'));
      const missing = segments.filter((s) => !declared.has(s));
      if (missing.length > 0) {
        offenders.push({ label, route: definition.route, full, missing });
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `MENU_MAP referencia ${offenders.length} ruta(s) cuyos segmentos no ` +
          `están en app.routes.ts. ¿Se borró o renombró la ruta en el frontend? ` +
          `Detalle: ${JSON.stringify(offenders, null, 2)}`,
      );
    }
  });

  it('parametric segments of MENU_MAP routes (`:id`, `:rolId`) are declared in app.routes.ts', () => {
    // Belt-and-suspenders sobre las rutas parametrizadas. Si alguien
    // cambia `path: ':id'` por `path: ':idd'` en `app.routes.ts`,
    // un cambio mecánico en `MENU_MAP` no se detecta con el filtro
    // del test principal (los `:xxx` se filtran). Este test exige
    // que cada `:xxx` declarado en MENU_MAP exista como `path: ':xxx'`
    // literal en `app.routes.ts`.
    const declared = readAppRoutesSegments();
    const offenders: Array<{ route: string; param: string }> = [];

    for (const [, definition] of Object.entries(MENU_MAP)) {
      const params = definition.route.match(/:\w+/g) ?? [];
      for (const param of params) {
        if (!declared.has(param)) {
          offenders.push({ route: definition.route, param });
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `MENU_MAP referencia ${offenders.length} segmento(s) paramétrico(s) que ` +
          `no están declarados como path literal en app.routes.ts. ` +
          `Detalle: ${JSON.stringify(offenders, null, 2)}`,
      );
    }
  });

  it('MENU_MAP has a non-empty set of entries', () => {
    // Red anti-regresión contra un mapa vaciado por accidente.
    expect(Object.keys(MENU_MAP).length).toBeGreaterThan(0);
  });

  it('MENU_MAP orders are unique and ascending (D3)', () => {
    // Si dos entradas comparten `order`, la ordenación del sidebar
    // queda en manos de `Object.entries()` y vuelve el bug original.
    const orders = Object.values(MENU_MAP).map((d) => d.order);
    const unique = new Set(orders);
    expect(unique.size).toBe(orders.length);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it('F1.1.3: Assignments and Comments are not in the menu (D4)', () => {
    // F1.1.3 retiró `Assignments` y `Comments` del mapa. La retirada
    // afecta sólo al menú; los permisos y los endpoints quedan. Si
    // alguien los reinserta acá, este test falla.
    expect(MENU_MAP['Assignments']).toBeUndefined();
    expect(MENU_MAP['Comments']).toBeUndefined();
  });

  it('every entry has a Lucide icon name (F0 contrato: no `bi bi-`)', () => {
    // El sidebar ya no acepta la familia `bi bi-*` (F0.2). Si una
    // entrada se queda sin `icon`, el componente cae al respaldo
    // y rompe la consistencia visual.
    for (const [, definition] of Object.entries(MENU_MAP)) {
      expect(definition.icon).toBeDefined();
      expect(definition.icon).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
