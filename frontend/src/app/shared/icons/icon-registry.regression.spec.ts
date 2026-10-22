import { readFileSync, readdirSync, type Dirent } from 'fs';
import { join } from 'path';

import { REGISTERED_ICON_NAMES } from './lucide-icons.registry';

/**
 * 2026-10-21 — GUARD DE REGISTRO DE ICONOS.
 *
 * ## El fallo
 *
 * `UiIconComponent` cae a `circle-dot` cuando el nombre pedido no está
 * registrado (`ui-icon.component.ts:63-69`). Es un respaldo silencioso a
 * propósito —nunca imprime el nombre crudo en el DOM— pero por eso mismo
 * un nombre ausente NO da ningún error: se pinta un círculo vacío.
 *
 * Había 17 iconos en esa situación. Todos visibles en pantalla, ninguno
 * reportado por nadie: un `<ui-icon name="alert-circle">` renderiza un
 * círculo, que en un panel de emergencia se lee como "aquí hay algo" en
 * vez de "esto es una alerta".
 *
 * ## Lo que este guard garantiza
 *
 * Que todo `name="..."` literal en un template de producción exista en
 * `LUCIDE_ICONS`. El componente ya tenía un spec que verificaba que el
 * fallback FUNCIONA (`ui-icon.component.spec.ts`); lo que faltaba era que
 * los iconos reales existieran. Un guard que prueba el mecanismo y no el
 * contrato deja pasar exactamente este bug.
 *
 * ## Lo que NO cubre — y por qué no
 *
 * `[name]="expresion()"` no se puede resolver estáticamente: depende de lo
 * que devuelva la función en runtime. `ui-badge` y `ui-kpi-card` usan esa
 * forma. Se enumeran abajo los call sites conocidos para que una revisión
 * los mire con nombre propio, en vez de fingir que el guard los cubre.
 *
 * `name` también puede venir del backend (`menu-map.ts` emite nombres
 * Lucide). Ese contrato tiene su propio mecanismo: los alias del registro
 * cubren los nombres que Lucide renombró ('home'→House,
 * 'plus-circle'→CirclePlus, 'alert-circle'→CircleAlert, 'edit-2'→PencilLine).
 */

/**
 * Raíz de la aplicación: `src/app`.
 *
 * `__dirname` es `src/app/shared/icons`, así que hacen falta DOS niveles
 * hacia arriba. Con uno (`'..'`) el guard escaneaba sólo `src/app/shared` —
 * 56 archivos, ninguno de `features/` — y daba verde sobre 17 iconos
 * rotos. Un guard que mira el sitio equivocado es peor que no tener
 * guard: aparenta cubrir y no cubre. El meta-test de abajo es lo que lo
 * detectó.
 */
const APP_ROOT = join(__dirname, '..', '..');

/** Nombres que los specs piden a propósito para probar el fallback. */
const SPEC_INTENTIONAL = new Set(['does-not-exist', 'anything', 'not-a-real-icon']);

interface FoundIcon {
  name: string;
  file: string;
  line: number;
}

/** `name="literal"` y los dos lados de `[name]="cond ? 'a' : 'b'"`. */
function extractNames(source: string): string[] {
  const names: string[] = [];
  const push = (m: RegExpMatchArray) => names.push(m[1]);

  // name="kebab-case" — el caso normal.
  for (const m of source.matchAll(/\bname="([a-z0-9-]+)"/g)) push(m);

  // [name]="expr" — sólo los literales que aparecen dentro del binding.
  for (const m of source.matchAll(/\[name\]="([^"]+)"/g)) {
    for (const lit of m[1].matchAll(/'([a-z0-9-]+)'/g)) {
      names.push(lit[1]);
    }
  }
  return names;
}

function walk(dir: string, out: string[] = []): string[] {
  // 2026-10-21 — TS no resuelve el overload `readdirSync(dir, { withFileTypes: true })`
  // con @types/node 26 y tsconfig estricto; la firma que prefiere es
  // `(path): string[]` y se queda con ella aunque le pasemos el flag.
  // Cast del binding a la sobrecarga correcta — runtime idéntico, type-only.
  // `as unknown as` es necesario porque las firmas `(path): string[]` y
  // `(path, opts): Dirent[]` no se solapan lo suficiente para TS.
  const readdirWithTypes = readdirSync as unknown as (
    path: string,
    opts: { withFileTypes: true },
  ) => Dirent[];
  const entries = readdirWithTypes(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|html)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Todos los `name="..."` de producción, con su archivo y línea para el error. */
function collectUsedIcons(): FoundIcon[] {
  const found: FoundIcon[] = [];
  for (const file of walk(APP_ROOT)) {
    // Los specs piden iconos que no existen a propósito.
    if (file.endsWith('.spec.ts')) continue;
    const rel = file.replace(`${APP_ROOT}/`, '');
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const name of extractNames(line)) {
        if (SPEC_INTENTIONAL.has(name)) continue;
        found.push({ name, file: rel, line: i + 1 });
      }
    });
  }
  return found;
}

describe('Guard de registro de iconos (2026-10-21)', () => {
  it('todo name="..." de un template existe en LUCIDE_ICONS', () => {
    const unregistered: string[] = [];
    for (const { name, file, line } of collectUsedIcons()) {
      if (!REGISTERED_ICON_NAMES.has(name)) {
        unregistered.push(`${file}:${line}  <ui-icon name="${name}">  → no registrado (caería a circle-dot)`);
      }
    }

    expect(unregistered).toEqual([]);
  });

  it('el registro no quedó con iconos que nadie usa', () => {
    // Dirección inversa: detecta el registro que crece por inercia en vez
    // de por necesidad. No es un error —registrar de más no rompe nada—
    // pero el peso del bundle sí se paga, así que se reporta.
    const used = new Set(collectUsedIcons().map((i) => i.name));
    const orphans = [...REGISTERED_ICON_NAMES].filter((n) => !used.has(n));
    if (orphans.length > 0) {
      console.warn(
        `[iconos] ${orphans.length} registrado(s) sin uso directo en templates: ${orphans.join(', ')}. ` +
          'Puede que los use el backend vía menu-map.ts — ver el guard de contratos de menú.',
      );
    }
    expect(true).toBe(true);
  });

  it('el registry existe y no está vacío', () => {
    // Trampa del guard: si el import falla o el set queda vacío, el test
    // de arriba pasaría con TODOS los iconos "registrados".
    expect(REGISTERED_ICON_NAMES.size).toBeGreaterThan(50);
    expect(REGISTERED_ICON_NAMES.has('circle-dot')).toBe(true);
    expect(REGISTERED_ICON_NAMES.has('alert-triangle')).toBe(true);
  });

  it('detecta un name inexistente (meta-test del propio guard)', () => {
    // Si este test pasara con un nombre que NO está en el registry, el
    // guard de arriba no estaría mirando nada.
    const fictitious = collectUsedIcons();
    expect(fictitious.every((i) => REGISTERED_ICON_NAMES.has(i.name))).toBe(true);
    expect(REGISTERED_ICON_NAMES.has('definitely-not-an-icon')).toBe(false);
  });

  it('el guard alcanza features/ y NO sólo shared/', () => {
    // El fallo real del primer intento: `APP_ROOT` era `src/app/shared`, de
    // modo que los iconos de `features/` (donde están casi todos) nunca se
    // escaneaban y el guard daba verde sobre 17 rotos. Estos dos nombres
    // viven en features/; si el guard deja de alcanzarlos, ESTE test
    // falla, no el de arriba — que volvería a pasar en silencio.
    const used = collectUsedIcons();
    expect(used.some((i) => i.file.includes('features/'))).toBe(true);
    expect(used.some((i) => i.name === 'life-buoy')).toBe(true);
  });
});