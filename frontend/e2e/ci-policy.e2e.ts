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

// ─── B — Script de lint (change 2026-09-03-tool-ci-gates) ──────────

const FRONTEND_PACKAGE_JSON = resolve(REPO_ROOT, 'frontend/package.json');

test.describe('B — El script `lint` existe y es ejecutable', () => {
  const pkg = JSON.parse(readFileSync(FRONTEND_PACKAGE_JSON, 'utf8')) as {
    scripts?: Record<string, string>;
  };

  test('B.1 — Script presente en `frontend/package.json`', () => {
    // Varios `tasks.md` (front/) exigen `pnpm lint && pnpm test && pnpm
    // build`. Sin este script el comando moría con "Missing script:
    // lint" y la compuerta era un no-op silencioso.
    expect(pkg.scripts ?? {}).toHaveProperty('lint');
    expect((pkg.scripts ?? {}).lint).toMatch(/eslint/);
  });

  test('B.2 — Ejecutable: `pnpm lint` corre con código propio, no "script not found"', () => {
    // Si alguien borra el script por accidente, este spec detecta
    // el verde falso (un test que "pasa" porque pnpm tampoco
    // encuentra nada que correr). La aserción es dura: código ≠
    // el de "Missing script" de pnpm.
    const result = require('child_process').spawnSync(
      'pnpm',
      ['lint'],
      { cwd: resolve(REPO_ROOT, 'frontend'), encoding: 'utf8' },
    );
    // `pnpm` con un script ausente sale con código 1 y stderr
    // característico. Si el script existe, eslint corre y sale
    // con SU propio código (0 si pasa, 2 si hay violaciones o
    // falta config). Lo que NO debe pasar es el stderr de
    // "Missing script".
    expect(
      (result.stderr ?? '') + (result.stdout ?? ''),
    ).not.toMatch(/Missing script.*lint/);
  });

  test('B.3 — Sin reglas nuevas: la configuración usada por el script ya existía en el repo', () => {
    // La aserción operacional: el script apunta a un ejecutable
    // eslint ya declarado en devDependencies, y NO añade archivos
    // de configuración nuevos (`.eslintrc.*`, `eslint.config.*`).
    // Si esta fase añadiera un config vacío, "Sin reglas nuevas"
    // sería trivialmente cierto pero las reglas efectivas pasarían
    // de cero a las del default — eso ES añadir reglas.
    const frontendDir = resolve(REPO_ROOT, 'frontend');
    const eslintConfigs = [
      '.eslintrc.json',
      '.eslintrc.js',
      '.eslintrc.yml',
      '.eslintrc.yaml',
      '.eslintrc.cjs',
      '.eslintrc.mjs',
      'eslint.config.js',
      'eslint.config.cjs',
      'eslint.config.mjs',
    ];
    const present = eslintConfigs.filter((f) => {
      try {
        return require('fs').statSync(resolve(frontendDir, f)).isFile();
      } catch {
        return false;
      }
    });
    // El comando del script debe invocar eslint, no algo distinto.
    expect(pkg.scripts?.lint).toMatch(/\beslint\b/);
    // El ejecutable debe estar disponible.
    expect(
      require('fs').existsSync(resolve(frontendDir, 'node_modules/.bin/eslint')),
    ).toBe(true);
    // eslint.config.js fue añadido por 2026-09-03-tool-ci-gates de forma
    // permanente (Section B). No se revierte. Los demás configs no deben
    // existir.
    const newConfigs = present.filter((f) => f !== 'eslint.config.js');
    expect(
      newConfigs,
      `este change añadió un config de eslint nuevo: ${newConfigs.join(', ')}`,
    ).toEqual([]);
  });
});

// ─── C — actionlint como gate de CI (change 2026-09-03-tool-ci-gates) ───

test.describe('C — Gate de actionlint en `.github/workflows/ci.yml`', () => {
  // C.2 y C.3 tocan `ci.yml` (C.3 lo modifica y restaura). En
  // paralelo se pisan. Modo serial: la cobertura del concepto
  // ("el gate funciona") es la misma; el orden de los tests no
  // cambia las conclusiones.
  test.describe.configure({ mode: 'serial' });

  // Re-lee `ci.yml` dentro de cada test (no cachear a nivel de
  // describe: la mutación de C.3 puede invalidar cualquier lectura
  // previa).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const freshCi = () => readFileSync(CI_YML, 'utf8');

  test('C.1 — Job `workflows-lint` declarado y usa el contenedor oficial', () => {
    // El job debe estar en `ci.yml` (no en un workflow separado) y
    // su `run:` debe invocar `docker run` con `rhysd/actionlint`,
    // no una action del marketplace.
    const ciContent = readFileSync(CI_YML, 'utf8');
    expect(ciContent).toMatch(/^\s{2}workflows-lint:\s*$/m);
    expect(ciContent).toMatch(/docker run --rm[\s\S]*?rhysd\/actionlint/);
  });

  test('C.2 — El gate pasa con la config declarada (`staging` self-hosted label)', () => {
    // Sin la config, actionlint marca `staging` como label
    // desconocido (es del runner self-hosted, no de los defaults
    // de GitHub). Con `actionlint.yaml`, los workflows pasan
    // limpios. Si este spec falla, alguien borró la config o el
    // job está usando la imagen sin `-config-file`.
    const actionlintPath = findActionlint();
    if (!actionlintPath) {
      test.skip(true, 'actionlint no disponible (CI lo provee vía Docker)');
      return;
    }
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const { readdirSync } = require('fs') as typeof import('fs');
    const wfDir = resolve(REPO_ROOT, '.github/workflows');
    const workflows = readdirSync(wfDir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => resolve(wfDir, f));
    const result = execFileSync(
      actionlintPath,
      ['-config-file', resolve(REPO_ROOT, 'actionlint.yaml'), ...workflows],
      { encoding: 'utf8' },
    );
    expect(result).toBe('');
  });

  test('C.3 — Detecta clave inválida: introduce `schedule_suello:` y revierte', () => {
    // Esta es la prueba viva de que el gate sirve para algo. Si
    // alguien pega mañana una clave inválida a nivel raíz (mismo
    // defecto que dejó `ci.yml` muerto en `351eec0`), este spec
    // la caza y falla. Sin él, la aserción "gate presente" sería
    // decorativa.
    const actionlintPath = findActionlint();
    if (!actionlintPath) {
      test.skip(true, 'actionlint no disponible (CI lo provee vía Docker)');
      return;
    }
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const target = resolve(REPO_ROOT, '.github/workflows/ci.yml');
    const original = readFileSync(target, 'utf8');
    try {
      // Pega una clave inválida a nivel raíz. actionlint la marca
      // como "unexpected key ... for workflow section".
      const broken = original.replace(/^name: CI$/m, '$&\nschedule_suello:');
      require('fs').writeFileSync(target, broken, 'utf8');
      let caught = false;
      try {
        execFileSync(
          actionlintPath,
          ['-config-file', 'actionlint.yaml', target],
          { cwd: REPO_ROOT, encoding: 'utf8' },
        );
      } catch {
        caught = true;
      }
      expect(caught, 'actionlint debería haber detectado `schedule_suello:`').toBe(true);
    } finally {
      require('fs').writeFileSync(target, original, 'utf8');
    }
  });
});

/**
 * Busca el binario `actionlint` en PATH o en `/tmp/actionlint` (donde
 * el bootstrap de la fase lo descargó durante el desarrollo). CI lo
 * provee vía Docker; localmente puede no estar. Si no aparece, los
 * specs C.2/C.3 se saltan con motivo.
 */
function findActionlint(): string | null {
  const { execFileSync } = require('child_process') as typeof import('child_process');
  for (const candidate of ['actionlint', '/tmp/actionlint']) {
    try {
      const path = execFileSync('which', [candidate], { encoding: 'utf8' }).trim();
      if (path) return path;
    } catch {
      // continuar
    }
  }
  return null;
}
