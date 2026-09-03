import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
// @ts-expect-error -- `@types/node` no está en `tsconfig.spec.json:types`;
// mismo gap que afecta a `contrast.regression.spec.ts`,
// `layout-tokens.regression.spec.ts`, `sidebar.spec.ts`,
// `auth.interceptor.regression.spec.ts`. Resolver globalmente en un
// change dedicado (agregar `@types/node` a devDependencies) — no
// hacerlo aquí silencia los 3 errores preexistentes del patrón sin
// sumar archivos al problema.
import * as fs from 'node:fs';
// @ts-expect-error -- ver import anterior.
import * as path from 'node:path';
import { PlaceholderComponent } from './placeholder.component';

/**
 * F1 (D2) — Test de PlaceholderComponent.
 *
 * Cubre CRITICAL-1 (verify pass 1): las 6 rutas placeholder en
 * `app.routes.ts` montan este componente pasándole `title` y `phase`
 * por `route.data`. Para que Angular los bindee como `@Input()`s hace
 * falta `withComponentInputBinding()` en el `provideRouter` de
 * `app.config.ts`. Sin eso, los inputs requeridos lanzan `NG0950` y
 * el outlet queda sin pintar (con `ErrorHandler` default) — el clic
 * del sidebar no muestra 404 pero tampoco muestra "en construcción",
 * que es lo que D2 promete.
 *
 * El test cubre tres frentes:
 *  1. El componente, con sus inputs requeridos, renderiza cuando se
 *     le pasan los valores (red anti-regresión del contrato del
 *     componente).
 *  2. TestBed directo SIN bindings lanza NG0950 — reproduce el bug
 *     original (placeholder sin inputs falla ruidosamente, no se
 *     pinta vacío en silencio).
 *  3. La integración con el router está correctamente cableada en la
 *     producción: `withComponentInputBinding()` está en
 *     `app.config.ts`, y cada ruta placeholder en `app.routes.ts`
 *     pasa `title` y `phase` por `data`. Verificación por lectura
 *     literal de los dos archivos — es la red anti-regresión que
 *     evita que alguien retire el binding o se olvide de la data
 *     en una ruta nueva.
 */
describe('PlaceholderComponent (F1, D2)', () => {
  it('renderiza el título cuando se le pasan los inputs directamente', async () => {
    await render(PlaceholderComponent, {
      inputs: { title: 'Lista de Incidencias', phase: 'F3' },
    });

    expect(screen.getByText('Lista de Incidencias')).toBeTruthy();
    expect(screen.getByText(/Esta pantalla llega en la fase F3/)).toBeTruthy();
  });

  it('REGRESIÓN: TestBed directo sin bindings lanza NG0950', () => {
    // Reproduce el escenario original: el router monta el componente
    // sin pasarle los inputs requeridos. Sin `withComponentInputBinding()`
    // no hay mecanismo de recuperación; Angular aborta.
    TestBed.configureTestingModule({
      imports: [PlaceholderComponent],
    });

    expect(() => {
      const fixture = TestBed.createComponent(PlaceholderComponent);
      fixture.detectChanges();
    }).toThrow(/NG0950|Input is required/);
  });

  it('cableado de producción: withComponentInputBinding está en app.config.ts', () => {
    // Verifica que el binding que cierra CRITICAL-1 está aplicado.
    // Si alguien lo retira, las 6 rutas placeholder vuelven al bug.
    // @ts-expect-error -- `__dirname` requiere `@types/node`; ver imports.
    const here: string = __dirname;
    const appConfigPath = path.resolve(here, '../../app.config.ts');
    const appConfigSrc = fs.readFileSync(appConfigPath, 'utf8');
    expect(appConfigSrc).toMatch(/provideRouter\s*\([^)]*withComponentInputBinding\s*\(/);
  });

  it('cableado de producción: cada ruta placeholder pasa title y phase vía data', () => {
    // Cada una de las 6 rutas placeholder debe traer `data: { title, phase }`.
    // La convención F1 marca las rutas placeholder con `// PLACEHOLDER F<n>`.
    // Para cada comentario, encontramos el bloque de ruta que lo contiene
    // y verificamos que su data incluye `title` y `phase`.
    // @ts-expect-error -- `__dirname` requiere `@types/node`; ver imports.
    const here: string = __dirname;
    const routesPath = path.resolve(here, '../../app.routes.ts');
    const routesSrc = fs.readFileSync(routesPath, 'utf8');

    // 1. Existen al menos 3 placeholders (F2 retiró los suyos).
    const placeholderComments = routesSrc.match(/\/\/\s*PLACEHOLDER\s+F\d+/g) ?? [];
    expect(placeholderComments.length).toBeGreaterThanOrEqual(3);

    // 2. Para cada placeholder, encontramos el bloque `{ ... }` que
    //    termina en su comentario y validamos el data.
    const commentPositions = [...routesSrc.matchAll(/\/\/\s*PLACEHOLDER\s+F\d+/g)];
    for (const cm of commentPositions) {
      const endIdx = cm.index! + cm[0].length;
      // Retrocedemos hasta el `{` que abre el bloque de la ruta, contando
      // llaves. El comentario está adentro del bloque, así que el `{` más
      // cercano con profundidad 1 es el de apertura.
      let depth = 0;
      let openIdx = -1;
      for (let i = endIdx; i >= 0; i--) {
        const c = routesSrc[i];
        if (c === '}') depth++;
        else if (c === '{') {
          if (depth === 0) {
            openIdx = i;
            break;
          }
          depth--;
        }
      }
      expect(openIdx).toBeGreaterThanOrEqual(0);

      // Ahora extraemos el bloque completo y buscamos el data.
      const block = routesSrc.slice(openIdx, endIdx);
      const dataMatch = block.match(/data:\s*\{([^}]*)\}/);
      expect(dataMatch).not.toBeNull();
      const dataBlock = dataMatch![1];

      const pathMatch = block.match(/path:\s*'([^']+)'/);
      const pathName = pathMatch?.[1] ?? '???';

      expect(dataBlock).toMatch(/\btitle\s*:/);
      expect(dataBlock).toMatch(/\bphase\s*:/);
      // Sanity: breadcrumb debe seguir presente (es lo que el sidebar
      // y el breadcrumb component leen para mostrar la ruta actual).
      expect(dataBlock).toMatch(/\bbreadcrumb\s*:/);
      // No se acepta un pathName vacío.
      expect(pathName.length).toBeGreaterThan(0);
    }
  });
});
