import { readFileSync } from 'fs';
import { resolve } from 'path';
import { test, expect } from '@playwright/test';

/**
 * C.4 — el job `frontend-e2e` cachea `~/.cache/ms-playwright` con una
 *        clave que ata al lockfile de pnpm. Si el lockfile cambia, la
 *        clave cambia y el navegador se re-descarga.
 * C.5 — la corrida está acotada (`globalTimeout`, `maxFailures`, un
 *        worker) — configurado en `efe021f` y protegido por este spec
 *        para que nadie lo revierta accidentalmente.
 *
 * Ambos son chequeos sobre archivos del repo. No necesitan un backend
 * — son I/O puro sobre el árbol del repo, y se ejecutan también cuando
 * `BASE_URL` no está definido (el helper no se invoca).
 */
const REPO_ROOT = resolve(__dirname, '..', '..');
const CI_YML = resolve(REPO_ROOT, '.github/workflows/ci.yml');
const PLAYWRIGHT_CONFIG = resolve(REPO_ROOT, 'frontend/playwright.config.ts');

test.describe('C.4 — Caché de Playwright en CI', () => {
  const ciContent = readFileSync(CI_YML, 'utf8');

  test('Caché declarada — el job cachea ~/.cache/ms-playwright', () => {
    // Busca el bloque de cache por su path. La regex exige
    // `actions/cache@v4` (mismo major que el resto del workflow) y
    // `~/.cache/ms-playwright` como path exacto — no como string
    // suelto en un comentario.
    expect(ciContent).toMatch(
      /uses:\s*actions\/cache@v4[\s\S]{0,400}?path:\s*~?\/\.cache\/ms-playwright/,
    );
  });

  test('Acierto de caché — la clave incluye el SO y el hash del lockfile', () => {
    // La clave correcta ata al lockfile de pnpm (`hashFiles` lo
    // recalcula). Un cambio de SO o de lockfile cambia la clave; el
    // navegador se vuelve a descargar.
    expect(ciContent).toMatch(
      /key:\s*playwright-\$\{\{\s*runner\.os\s*\}\}-\$\{\{\s*hashFiles\(\s*['"]frontend\/pnpm-lock\.yaml['"]\s*\)\s*\}\}/,
    );
  });

  test('Invalidación — la clave usa hashFiles del lockfile, no una versión fija', () => {
    // Anti-regresión: que la versión de Playwright no esté hard-coded
    // en la clave. Si alguien la hard-coda, deja de invalidarse al
    // bumpear Playwright y aparece un mismatch silencioso.
    expect(ciContent).not.toMatch(/key:\s*playwright-\$\{\{\s*runner\.os\s*\}\}-\$\{\{\s*hashFiles[^}]*1\./);
  });
});

test.describe('C.5 — La corrida está acotada', () => {
  const configContent = readFileSync(PLAYWRIGHT_CONFIG, 'utf8');

  test('Techo global — globalTimeout declarado para CI', () => {
    // El default de Playwright también es 30 s por test, pero
    // globalTimeout es lo que acota la corrida entera. Sin él, un
    // job puede consumir el límite de 360 min de GitHub Actions.
    expect(configContent).toMatch(/globalTimeout:\s*process\.env\[['"]CI['"]\]\s*\?\s*\d/);
  });

  test('Corte temprano — maxFailures definido para CI', () => {
    // Sin un corte temprano, una suite rota reporta N fallos que
    // son la misma causa repetida. 3 es el umbral del change
    // (efe021f): más alto enmascara, más bajo pierde corridas que
    // se arreglan solas.
    expect(configContent).toMatch(/maxFailures:\s*process\.env\[['"]CI['"]\]\s*\?\s*3/);
  });

  test('En serie — workers: 1 en CI', () => {
    // Los specs corren contra un staging COMPARTIDO y crean
    // comentarios. En paralelo se pisarían entre sí (D6). Mantener
    // el `workers: 1` aquí es la red que evita revertir esa decisión
    // a "más velocidad" en un PR.
    expect(configContent).toMatch(/workers:\s*process\.env\[['"]CI['"]\]\s*\?\s*1/);
  });
});
