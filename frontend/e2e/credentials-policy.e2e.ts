import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { test, expect } from '@playwright/test';

import {
  resolveE2eAdminCredentials,
  resolveE2eCredentials,
} from './_helpers/e2e-credentials';

/**
 * Spec de la política de credenciales de la suite e2e.
 *
 * B.6 — Sin literales / Login con las del entorno / Correo por defecto.
 * B.7 — D4: sin entorno se salta, configuración incompleta falla, no se
 *         salta por falta de secret, configuración completa ejecuta de
 *         verdad.
 *
 * No necesita un backend: la mitad es I/O de archivos y la mitad es
 * lógica pura del helper. La parte que SÍ necesita backend ("configuración
 * completa ejecuta de verdad") se valida en D.1 contra staging.
 */

// Snapshot del entorno para no contaminar el resto de la suite.
// Cada test restaura al final con la snap que capturó.
const ENV_SNAPSHOT = new Map<string, string | undefined>();
for (const key of [
  'BASE_URL',
  'E2E_PASSWORD',
  'E2E_USER',
  'E2E_ADMIN_USER',
]) {
  ENV_SNAPSHOT.set(key, process.env[key]);
}

function clearEnv(): void {
  for (const key of ENV_SNAPSHOT.keys()) {
    delete process.env[key];
  }
}

function restoreEnv(): void {
  for (const [key, value] of ENV_SNAPSHOT.entries()) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test.afterEach(() => {
  restoreEnv();
});

// ─── B.6 ────────────────────────────────────────────────────────────

test.describe('B.6 — Política de credenciales en los specs', () => {
  const E2E_DIR = resolve(__dirname);

  function listE2eSpecs(): string[] {
    return readdirSync(E2E_DIR)
      .filter((f) => f.endsWith('.e2e.ts'))
      .map((f) => join(E2E_DIR, f));
  }

  test('Sin literales — ningún .e2e.ts contiene un correo o contraseña embebida', () => {
    // Recorre todos los archivos de la suite. Lo que esté acá dentro es
    // código del usuario: si alguien pega un `fill('admin@correo.com')`
    // o un `fill('123456')`, este test lo caza.
    //
    // Excluye:
    //   - este mismo archivo (es el que define la regla)
    //   - el helper, que sí tiene los defaults como constantes por
    //     diseño (D3)
    //   - los NOMBRES de tests (`test('master@tase.local: …', …)`): son
    //     documentación, no credenciales. La regla apunta a cadenas
    //     que podrían usarse para autenticar.
    const literals: string[] = [];
    for (const path of listE2eSpecs()) {
      if (path.endsWith('credentials-policy.e2e.ts')) continue;
      const content = readFileSync(path, 'utf8');
      // Tira los nombres de tests antes de buscar literales. Soporta
      // tanto `test('…', …)` como `test.skip('…', …)`. La heurística
      // es "primer argumento string de una llamada a test/test.skip".
      const code = content.replace(
        /(?<=\btest(?:\.skip)?\s*\(\s*)['"`][^'"`\n]*['"`]/g,
        '/* test name */',
      );
      // Email sembrado literal — patrón `xxx@tase.local` o similar.
      const emailMatches = code.match(/['"][^'"\n]+@[^'"\n]+\.[a-z]{2,}['"]/g);
      // Cadenas que huelan a contraseña de demo:
      //   - 'ChangeMe!Demo2026', '123456', 'admin@correo.com' (todos
      //     conocidos), o cualquier asignación `.fill('…')` con un
      //     string corto y sin espacios que no parezca una URL ni un
      //     selector.
      const fillMatches = code.match(/\.fill\(\s*['"][^'"]+['"]\s*\)/g) ?? [];
      for (const m of emailMatches ?? []) {
        if (m.includes('@tase.local') || m.includes('@correo.com')) {
          literals.push(`${path}: ${m}`);
        }
      }
      for (const m of fillMatches) {
        // Sólo señalamos los .fill que NO sean selectores (no empiezan
        // con /, no son una regex). Los placeholders tipo 'Test Category
        // E2E' no son credenciales, pero un password literal sí lo es.
        if (m.includes('ChangeMe!') || m.includes('123456') || m.includes('correo.com')) {
          literals.push(`${path}: ${m}`);
        }
      }
    }
    expect(literals, `literales encontrados:\n${literals.join('\n')}`).toEqual([]);
  });

  test('Login con las del entorno — los specs que hacen login importan el helper', () => {
    // Si un spec hace `page.getByLabel(/usuario/i).fill(...)` con un
    // valor que no sale del helper, debería importar el helper y
    // usar sus credenciales. Esta verificación es más floja que la
    // de "sin literales" — basta con que el import exista, porque
    // un spec puede llamar al helper sin terminar usándolo.
    const specsThatLogin = [
      'auth-flow.e2e.ts',
      'comment-flow.e2e.ts',
      'menu-navigation.e2e.ts',
      'catalogs-crud.e2e.ts',
      'catalogs-permissions.e2e.ts',
    ];
    const missing: string[] = [];
    for (const name of specsThatLogin) {
      const content = readFileSync(join(E2E_DIR, name), 'utf8');
      if (!content.includes('_helpers/e2e-credentials')) {
        missing.push(name);
      }
    }
    expect(missing, `estos specs no importan el helper: ${missing.join(', ')}`).toEqual([]);
  });

  test('Correo por defecto — sin E2E_USER, el helper devuelve e2e@tase.local', () => {
    clearEnv();
    process.env['BASE_URL'] = 'https://staging.tase.ec';
    process.env['E2E_PASSWORD'] = 'secret';
    const result = resolveE2eCredentials();
    expect(result.skip).toBe(false);
    if (!result.skip) {
      expect(result.user).toBe('e2e@tase.local');
    }
  });

  test('Correo configurable — con E2E_USER, el helper usa ese valor', () => {
    clearEnv();
    process.env['BASE_URL'] = 'https://staging.tase.ec';
    process.env['E2E_PASSWORD'] = 'secret';
    process.env['E2E_USER'] = 'otro@tase.local';
    const result = resolveE2eCredentials();
    expect(result.skip).toBe(false);
    if (!result.skip) {
      expect(result.user).toBe('otro@tase.local');
    }
  });
});

// ─── B.7 — D4 ──────────────────────────────────────────────────────

test.describe('B.7 — D4: «no configurado» se salta; «configurado y roto» falla', () => {
  test('Sin entorno — sin BASE_URL el helper devuelve skip con motivo', () => {
    clearEnv();
    const result = resolveE2eCredentials();
    expect(result.skip).toBe(true);
    if (result.skip) {
      expect(result.reason).toMatch(/BASE_URL/);
      expect(result.reason.length).toBeGreaterThan(10);
    }
  });

  test('Configuración incompleta — BASE_URL sin E2E_PASSWORD FALLA ruidosamente', () => {
    clearEnv();
    process.env['BASE_URL'] = 'https://staging.tase.ec';
    // E2E_PASSWORD ausente.
    expect(() => resolveE2eCredentials()).toThrow(/E2E_PASSWORD/);
  });

  test('No se salta por falta de secret — el resultado de la corrida NO es skipped', () => {
    // "No se salta por falta de secret" es una observación sobre el
    // comportamiento agregado: con BASE_URL presente y E2E_PASSWORD
    // ausente, la suite debe FALLAR, no reportar un skip.
    //
    // Ya cubierto por el test anterior (`expect(() => …).toThrow`).
    // Este test fija el contrato: que el helper no devuelva `{ skip:
    // true }` cuando la avería es de configuración, sino que lance.
    clearEnv();
    process.env['BASE_URL'] = 'https://staging.tase.ec';
    let threw = false;
    try {
      resolveE2eCredentials();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('Configuración completa — con BASE_URL y E2E_PASSWORD el helper ejecuta de verdad', () => {
    clearEnv();
    process.env['BASE_URL'] = 'https://staging.tase.ec';
    process.env['E2E_PASSWORD'] = 'secret-from-ci';
    const result = resolveE2eCredentials();
    expect(result.skip).toBe(false);
    if (!result.skip) {
      expect(result.user).toBe('e2e@tase.local');
      expect(result.password).toBe('secret-from-ci');
    }
  });

  test('El perfil admin respeta E2E_ADMIN_USER y default = master@tase.local', () => {
    clearEnv();
    process.env['BASE_URL'] = 'https://staging.tase.ec';
    process.env['E2E_PASSWORD'] = 'secret-from-ci';
    const def = resolveE2eAdminCredentials();
    expect(def.skip).toBe(false);
    if (!def.skip) {
      expect(def.user).toBe('master@tase.local');
    }

    process.env['E2E_ADMIN_USER'] = 'otro-master@tase.local';
    const overridden = resolveE2eAdminCredentials();
    expect(overridden.skip).toBe(false);
    if (!overridden.skip) {
      expect(overridden.user).toBe('otro-master@tase.local');
    }
  });

  // Regresión: la spec de la política existe como archivo. Si se borra
  // por accidente, este test sigue corriendo pero pierde la red sobre
  // los literales — y eso es justo el caso que más duele.
  test('Este archivo existe (sanity)', () => {
    const path = resolve(__dirname, 'credentials-policy.e2e.ts');
    expect(statSync(path).isFile()).toBe(true);
  });
});
