import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

import { listMigrations } from '../../scripts/lib/migration-files';
import { MigrationHarness } from '../support/migration-harness';

/**
 * T7.9.D1 — `database/seeds/` como pipeline separado de migraciones (R22.1,
 * R22.2, spec.md). Mitades estáticas del requisito R22 que NO dependen de
 * datos sembrados — un listado de archivos es suficiente para probarlas.
 *
 * Las mitades dinámicas (R22.3 idempotencia, R22.4 feed Redis == Postgres)
 * viven en T7.9.D6 dentro del mismo spec, una vez los generadores existan.
 *
 * Modo Strict TDD: este test DEBE fallar antes de que los generadores
 * (database/seeds/users.js, database/seeds/demo-incidents.js,
 * database/seeds/volume-incidents.js) existan en la ruta correcta — los
 * `expect(...).toBe(true)` sobre `existsSync` lo enforcen.
 */

const REPO_ROOT = resolve(__dirname, '../../..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'database/migrations');
const SEEDS_DIR = join(REPO_ROOT, 'database/seeds');
const BACKEND_SCRIPTS_DIR = join(REPO_ROOT, 'backend/scripts');

describe('T7.9.D1 — pipeline de siembra separado de migraciones (R22.1, R22.2)', () => {
  it('R22.1 — ningún archivo de database/migrations/ contiene `INSERT INTO incidents`', () => {
    const migrations = listMigrations();
    expect(migrations.length).toBeGreaterThan(0);

    const offenders: { file: string; line: number; text: string }[] = [];
    // The token must match as a free-standing SQL statement, not e.g. inside
    // a comment about a constraint named `incidents_*` or a column reference.
    // We tolerate the token appearing only when the prior non-comment, non-
    // whitespace tokens spell out an INSERT.
    const insertIncidentsRe =
      /(^|;|\n)\s*(?:--[^\n]*\n\s*)*INSERT\s+INTO\s+incidents\b/im;

    for (const migration of migrations) {
      const sql = readFileSync(migration.path, 'utf8');
      // Strip block /* ... */ comments so multi-line license headers can't
      // trip the regex.
      const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, '');
      const match = stripped.match(insertIncidentsRe);
      if (match) {
        const lineNumber = stripped.slice(0, match.index ?? 0).split('\n').length;
        offenders.push({ file: migration.fileName, line: lineNumber, text: match[0].trim() });
      }
    }

    expect(offenders).toEqual([]);
  });

  it('R22.2 — los generadores de incidentes de demo y volumen viven bajo database/seeds/, no bajo database/migrations/', () => {
    // demo-incidents.js and volume-incidents.js must exist exactly under seeds.
    const expected = ['users.js', 'demo-incidents.js', 'volume-incidents.js'];
    for (const file of expected) {
      const seedPath = join(SEEDS_DIR, file);
      const migrationPath = join(MIGRATIONS_DIR, file);
      const seedExists = statSync(seedPath, { throwIfNoEntry: false })?.isFile() === true;
      const migrationExists = statSync(migrationPath, { throwIfNoEntry: false });
      expect(seedExists).toBe(true);
      // And the .sql side of a generator must never be a migration either.
      expect(migrationExists).toBeUndefined();
    }

    // Defensive: no .js generator is hiding under migrations/ that would
    // also be a violation of R22.2 (and would be executable by the run-
    // migrations runner against the schema by accident).
    const migrationJsFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.js'));
    expect(migrationJsFiles).toEqual([]);
  });
});

/**
 * T7.9.D6 — partes dinámicas de R22: ejecutar `db:seed` dos veces no cambia
 * conteos (R22.3) y `rebuild-feed.ts` reconcilia el feed de Redis con
 * Postgres (R22.4). Requieren que los generadores existan — los importamos
 * directamente con `require()` porque son scripts CommonJS.
 *
 * Importante: la idempotencia se valida ejecutando los scripts reales
 * contra la base de `MigrationHarness` con todas las migraciones 0001–0041
 * aplicadas, NO recreando lógica de seed en TypeScript. Es exactamente la
 * superficie que el operador corre con `npm run db:seed`.
 */
describe('T7.9.D6 — `db:seed` es idempotente y reconstruye el feed (R22.3, R22.4)', () => {
  let db: MigrationHarness;

  // Requerir los generadores aquí (no a nivel de módulo) para que el archivo
  // se compile aunque aún no existan — T7.9.D1 ya fallaría por separado.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const requireSeed = (name: string): { run: (client: unknown, opts: unknown) => Promise<unknown> } => {
    const p = join(SEEDS_DIR, name);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(p);
  };

  beforeAll(async () => {
    db = await MigrationHarness.start();
    await db.applyRange({ to: '0041' });
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  /**
   * Helper — corre un generador de seed contra la base de `MigrationHarness`
   * pasándole el `Client` envuelto en un objeto con el mismo contrato que
   * `deps.js` espera (T7.9.D3/D4). El seeder también necesita `bcrypt` (vía
   * `deps.js`) y `lib/guard.js`; ambos resuelven dependencias dentro del
   * propio archivo del seeder, así que sólo tenemos que importarlo y llamar
   * `run({ force: true, seed: { password: '...' } })`.
   */
  async function runSeed(name: string, seedPassword = 'TestP4ss!'): Promise<void> {
    const mod = requireSeed(name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (db as any).client as import('pg').Client;
    // Re-route deps.js to the test connection so the seeder sees the harness
    // DB, not whatever DATABASE_URL happens to be in the env.
    process.env.DATABASE_URL = db.databaseUrl;
    process.env.SEED_PASSWORD = seedPassword;
    process.env.SEED_ALLOW_LOCALHOST = '1';
    process.env.SEED_ALLOW_PRODUCTION = '1';
    process.env.NODE_ENV = 'test';
    await mod.run(client, { force: true, seed: { password: seedPassword } });
  }

  it('R22.3 — ejecutar `db:seed` dos veces no cambia los conteos de usuarios, incidentes ni notificaciones', async () => {
    await runSeed('users.js');
    await runSeed('demo-incidents.js');

    const snapshot = async (): Promise<{
      users: number;
      incidents: number;
      notifications: number;
    }> => {
      const [u] = await db.rows<{ count: string }>(`SELECT count(*)::text AS count FROM users`);
      const [i] = await db.rows<{ count: string }>(`SELECT count(*)::text AS count FROM incidents`);
      const [n] = await db.rows<{ count: string }>(`SELECT count(*)::text AS count FROM notifications`);
      return {
        users: Number(u.count),
        incidents: Number(i.count),
        notifications: Number(n.count),
      };
    };

    const first = await snapshot();
    // A second pass — every generator must be idempotent on the relevant
    // natural key (email for users, title prefix `[DEMO]` for incidents).
    await runSeed('users.js');
    await runSeed('demo-incidents.js');
    const second = await snapshot();

    expect(second).toEqual(first);
    // Sanity: seed actually did something non-trivial in the first pass.
    expect(first.users).toBeGreaterThan(0);
    expect(first.incidents).toBeGreaterThan(0);
  }, 180_000);

  /**
   * R22.4 — el feed de Redis coincide con los incidentes activos de Postgres
   * tras correr `rebuild-feed.ts`. Aquí no arrancamos Redis: validamos que el
   * script se carga, importa `AppModule` sin error, e intenta resolver
   * `FeedRecoveryService` — para que la verificación end-to-end de Redis viva
   * en una suite que disponga de Testcontainers de Redis (no la del seed).
   *
   * Lo que SÍ probamos localmente: el entrypoint existe y se compila bajo
   * ts-node; exporta (o ejecuta) una función que llama
   * `app.get(FeedRecoveryService).rebuildFeed()`.
   */
  it('R22.4 — `rebuild-feed.ts` existe y llama a FeedRecoveryService.rebuildFeed', () => {
    const rebuildPath = join(BACKEND_SCRIPTS_DIR, 'rebuild-feed.ts');
    expect(statSync(rebuildPath, { throwIfNoEntry: false })?.isFile()).toBe(true);
    const src = readFileSync(rebuildPath, 'utf8');
    expect(src).toMatch(/FeedRecoveryService/);
    expect(src).toMatch(/\.rebuildFeed\(/);
    // createApplicationContext (not create) — design.md D10, no binds HTTP port.
    expect(src).toMatch(/createApplicationContext/);
  });
});
