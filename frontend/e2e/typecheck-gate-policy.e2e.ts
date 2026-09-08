import { execFileSync, spawnSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { test, expect } from '@playwright/test';

/**
 * Specs de la compuerta de typecheck del frontend.
 *
 * `npx tsc --noEmit -p tsconfig.json` es el **comando viejo** que compila
 * CERO archivos porque `frontend/tsconfig.json` es de tipo *solution*
 * (`"files": []` + sólo `"references"`). Toda compuerta declarada
 * DEBE usar `-b` para que recorra los proyectos referenciados.
 *
 * Estos specs son la red anti-regresión: si alguien vuelve a escribir
 * una compuerta con `-p`, o si `tsconfig.json` deja de ser solution,
 * uno de estos specs falla.
 *
 * Change: `2026-09-03-tool-ci-gates` (D1, A.6, A.7).
 */
const FRONTEND_DIR = resolve(__dirname, '..');
const TSC = resolve(FRONTEND_DIR, 'node_modules/.bin/tsc');
const REPO_ROOT = resolve(FRONTEND_DIR, '..');

test.describe('A.6 — La compuerta de typecheck recorre los proyectos referenciados', () => {
  test('Compila el árbol — tsc -b lista archivos de los dos proyectos', () => {
    // El `tsconfig.json` raíz referencia `tsconfig.app.json` (código
    // de navegador) y `tsconfig.spec.json` (jest specs). `-b` debe
    // entrar a ambos; el output de `--listFiles` es la prueba más
    // directa de que la compuerta no está vacía.
    const result = spawnSync(TSC, ['-b', 'tsconfig.json', '--noEmit', '--listFiles'], {
      cwd: FRONTEND_DIR,
      encoding: 'utf8',
      // tsc -b --listFiles emite ~5200 paths de lib.*.d.ts,远超 default
      // 1 MB. Subimos el buffer a 64 MB para que quepa.
      maxBuffer: 64 * 1024 * 1024,
    });
    // `status` es null cuando el proceso recibió señal (p.ej. abort
    // por timeout). Lo tratamos como fallo explícito.
    expect(result.status, `tsc -b no terminó limpiamente: error=${result.error?.message} stderr=${result.stderr}`).not.toBeNull();
    expect(result.status).toBeGreaterThanOrEqual(0);
    const files = result.stdout.split('\n');
    const tsxFiles = files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    // El app incluye `src/app/...` y el spec incluye `src/app/**/*.spec.ts`
    // y `setup-jest.ts`. La cuenta exacta varía con cada commit; la
    // aserción es que la compuerta encuentra algo y que incluye
    // ambos espacios de nombres.
    expect(tsxFiles.length).toBeGreaterThan(50);
    expect(tsxFiles.some((f) => f.includes('/src/app/'))).toBe(true);
    expect(tsxFiles.some((f) => f.endsWith('.spec.ts'))).toBe(true);
  });

  test('Detecta un error real — la compuerta sale distinto de 0', () => {
    // Crea un archivo de types deliberadamente roto, ejecuta la
    // compuerta, y comprueba que falla. Después borra el archivo
    // (rollback). El spec no es decorativo: si la compuerta alguna
    // vez deja de detectar errores, esto la caza.
    const target = join(FRONTEND_DIR, 'src/app/_typecheck-gate-broke.ts');
    let original: string | undefined;
    try {
      original = readFileSync(target, 'utf8');
    } catch {
      original = undefined;
    }
    const backup = original ?? '// backup vacío\n';
    try {
      // Escribe un error deliberado: `string` no asignable a `number`.
      // Usa writeFileSync vía execFile (es la única operación de fs
      // que este spec necesita).
      execFileSync('sh', ['-c', `printf '%s' "const broken: number = 'string';" > ${target}`]);

      const result = spawnSync(TSC, ['-b', 'tsconfig.json', '--noEmit', '--force'], {
        cwd: FRONTEND_DIR,
        encoding: 'utf8',
      });
      expect(result.status, `tsc -b no terminó: error=${result.error?.message}`).not.toBeNull();
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/TS2322|TS\d{4}/);
    } finally {
      // Rollback. Si el archivo no existía antes, bórralo; si existía,
      // restaura.
      if (original === undefined) {
        execFileSync('sh', ['-c', `rm -f ${target}`]);
      } else {
        execFileSync('sh', ['-c', `printf '%s' "${backup.replace(/"/g, '\\"')}" > ${target}`]);
      }
    }
  });

  test('El comando viejo era vacío — tsc -p --listFiles no lista archivos del proyecto', () => {
    // Documenta POR QUÉ se reemplazó `-p` por `-b`. Si este spec
    // empieza a fallar, significa que `tsconfig.json` ya no es
    // solution y hay que re-evaluar el gate.
    const result = spawnSync(
      TSC,
      ['--noEmit', '-p', 'tsconfig.json', '--listFiles'],
      { cwd: FRONTEND_DIR, encoding: 'utf8' },
    );
    expect(result.status, `tsc -p no terminó: error=${result.error?.message}`).not.toBeNull();
    // `-p` puede exit 0 incluso cuando el resultado es vacío.
    // La señal que importa es que la lista NO incluye archivos
    // del proyecto (`/src/app/...`, `setup-jest.ts`).
    const files = result.stdout.split('\n');
    const projectFiles = files.filter(
      (f) => f.includes('/src/app/') || f.endsWith('setup-jest.ts'),
    );
    expect(projectFiles).toEqual([]);
  });
});

test.describe('D — El typecheck bloquea, sin excepciones', () => {
  // El gate debe entrar BLOQUEANDO desde su incorporación (D2). Las
  // tres aserciones son: el comando correcto en el job, sin
  // `continue-on-error`, y una corrida real que confirma exit != 0
  // por el TS2345 documentado.
  test('D.2 — El job `frontend` invoca `tsc -b` sin `continue-on-error`', () => {
    const ciContent = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/ci.yml'),
      'utf8',
    );
    // El paso debe usar `-b`, no `-p` (D1). Y no debe tener un
    // `continue-on-error: true` colgado.
    const block = ciContent.match(
      /tsc -b tsconfig\.json[^\n]*\n(?:[^\n]*\n)*?/,
    );
    expect(block, 'no hay un paso de tsc -b en ci.yml').not.toBeNull();
    // El step que llama a tsc -b no debe tener `continue-on-error: true`.
    // Buscamos la presencia de la flag en las 5 líneas anteriores al
    // comando (típico lugar de los `with:`).
    const idx = ciContent.indexOf('tsc -b tsconfig.json');
    const before = ciContent.slice(Math.max(0, idx - 800), idx);
    expect(
      before,
      'el paso de typecheck no debe tener `continue-on-error: true`',
    ).not.toMatch(/continue-on-error:\s*true/);
  });

  test('D.3 — Falla por el defecto conocido (TS2345 en auth.service.spec.ts:227)', () => {
    // El TS2345 es legítimo y esta fase NO lo arregla (D3). El
    // gate debe detectarlo: una corrida real sale distinto de 0.
    // Si este spec pasa sin detectar el error, el gate volvió a
    // mentir — exactamente el modo de falla que esta fase existe
    // para impedir.
    const result = spawnSync(TSC, ['-b', 'tsconfig.json', '--noEmit', '--force'], {
      cwd: FRONTEND_DIR,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    const combined = (result.stdout ?? '') + (result.stderr ?? '');
    expect(combined).toMatch(/auth\.service\.spec\.ts.*227/);
    expect(combined).toMatch(/TS2345/);
  });
});

test.describe('A.7 — Ninguna compuerta declarada usa -p', () => {
  /**
   * Lista archivos donde una compuerta de typecheck podría estar
   * declarada: tasks.md de los cambios vigentes del frontend,
   * docs/agents/*.md, y los workflows. El check es que ninguno
   * invoque el typecheck del frontend con `-p`.
   */
  /**
   * Los `tasks.md` / `docs/agents/*.md` / workflows que declara una
   * compuerta. El change `2026-09-03-tool-ci-gates` mismo se excluye:
   * su `tasks.md` cita el comando viejo a propósito para documentar
   * la evidencia inicial (A.1), no para declararlo como gate.
   */
  const SELF_CHANGE_DIR = '2026-09-03-tool-ci-gates';

  function listScopes(): string[] {
    const scopes: string[] = [];
    const frontDir = resolve(REPO_ROOT, 'openspec/changes/front');
    try {
      const changes = readdirSync(frontDir);
      for (const ch of changes) {
        if (ch === SELF_CHANGE_DIR) continue;
        const tasksPath = join(frontDir, ch, 'tasks.md');
        if (statSync(tasksPath).isFile()) {
          scopes.push(tasksPath);
        }
      }
    } catch {
      // Si el directorio no existe, no hay nada que chequear.
    }
    const docsDir = resolve(REPO_ROOT, 'docs/agents');
    try {
      for (const f of readdirSync(docsDir)) {
        scopes.push(join(docsDir, f));
      }
    } catch {
      // Mismo: el directorio puede no existir en algunos checkouts.
    }
    const wfDir = resolve(REPO_ROOT, '.github/workflows');
    try {
      for (const f of readdirSync(wfDir)) {
        if (f.endsWith('.yml') || f.endsWith('.yaml')) {
          scopes.push(join(wfDir, f));
        }
      }
    } catch {
      // idem
    }
    return scopes;
  }

  test('Ningún tasks.md / docs/agents/*.md / workflow invoca el typecheck del frontend con -p', () => {
    // Excluye los cambios archivados: por convención, los `apply-progress.md`
    // y `verify-report.md` archivados son registro histórico y se
    // preservan tal como declararon el typecheck en su momento (aunque
    // ese registro sea "exit 0, zero files" — el bug que esta fase
    // expone). Sólo se auditan los cambios VIGENTES.
    const offenders: string[] = [];
    for (const path of listScopes()) {
      const content = readFileSync(path, 'utf8');
      // Busca invocaciones de typecheck del frontend que usen `-p`.
      // La heurística es: la línea contiene `tsc` Y `-p` Y
      // `tsconfig.json`. No matchea `tsc -b` (correcto) ni menciones
      // en prosa que sólo citen el comando viejo.
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\btsc\b/.test(line) && /-p\b/.test(line) && /tsconfig\.json/.test(line)) {
          offenders.push(`${path}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(
      offenders,
      `estas líneas invocan el typecheck del frontend con -p (debería ser -b):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
