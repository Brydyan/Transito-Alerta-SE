import { resolve } from 'path';

import { MigrationHarness } from '../support/migration-harness';

/**
 * T7.9.D2 — `database/seeds/users.js` deja la distribución acordada
 * (R22.5, R22.6, spec.md):
 *   - 1 master, 1 operador_sistema (organization_id NULL)
 *   - 2 admin_org, 2 operador_org (organization_id = CTE - Santa Elena)
 *   - ON CONFLICT (email) DO NOTHING — re-ejecutar mantiene el conteo en 6.
 *
 * Test-first: este archivo DEBE fallar hasta que users.js exista. La
 * corrida real del seeder contra Postgres con 0001–0041 aplicadas detecta
 * los problemas estructurales (constraint violations, faltantes de
 * dependencias) que un test unitario con un Client mockeado se perdería.
 */
describe('T7.9.D2 — database/seeds/users.js (R22.5, R22.6)', () => {
  const REPO_ROOT = resolve(__dirname, '../../..');
  const USERS_SEED_PATH = resolve(REPO_ROOT, 'database/seeds/users.js');

  let db: MigrationHarness;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    await db.applyRange({ to: '0041' });
    // Reset auth-config knobs so the seeder's guard can run; we explicitly
    // point the deps to the test DB so the seeder doesn't reach the
    // operator's real one.
    process.env.DATABASE_URL = db.databaseUrl;
    process.env.SEED_PASSWORD = 'TestP4ss!';
    process.env.SEED_ALLOW_LOCALHOST = '1';
    process.env.SEED_ALLOW_PRODUCTION = '1';
    process.env.NODE_ENV = 'test';
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function runUsersSeed(): Promise<{ inserted: number; skipped: number; users: any[] }> {
    // Fresh require each call so module-level state (idempotency counters)
    // doesn't leak between runs — matches the way `npm run db:seed` invokes
    // a fresh Node process.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (require as any).cache[USERS_SEED_PATH];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(USERS_SEED_PATH);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mod.run((db as any).client, { force: true, seed: { password: 'TestP4ss!' } });
  }

  it('R22.5 — el seeder produce exactamente 6 usuarios con la distribución acordada', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('fs').existsSync(USERS_SEED_PATH)).toBe(true);

    const result = await runUsersSeed();
    expect(result.users.length).toBe(6);

    // Filtramos por email NOT NULL para excluir el usuario `anonymous` que
    // 0001_initial_schema.sql siembra automáticamente.
    const rows = await db.rows<{
      role: string;
      organization_id: string | null;
      count: string;
    }>(
      `SELECT role, organization_id, count(*)::text AS count
         FROM users
        WHERE deleted_at IS NULL AND email IS NOT NULL
        GROUP BY role, organization_id
        ORDER BY role`,
    );

    // Build a quick lookup for assertions.
    const byRole = new Map<string, number>();
    let orgBound = 0;
    let orgUnbound = 0;
    for (const row of rows) {
      byRole.set(row.role, Number(row.count));
      if (row.organization_id) orgBound += Number(row.count);
      else orgUnbound += Number(row.count);
    }

    expect(byRole.get('master')).toBe(1);
    expect(byRole.get('operador_sistema')).toBe(1);
    expect(byRole.get('admin_org')).toBe(2);
    expect(byRole.get('operador_org')).toBe(2);

    // 1 master + 1 operador_sistema are unbound.
    expect(orgUnbound).toBe(2);
    // 2 admin_org + 2 operador_org are bound to CTE - Santa Elena.
    expect(orgBound).toBe(4);

    const [org] = await db.rows<{ id: string }>(
      `SELECT id FROM organizations WHERE name = 'CTE - Santa Elena'`,
    );
    expect(org).toBeDefined();

    const boundRows = await db.rows<{ role: string }>(
      `SELECT role FROM users WHERE organization_id = $1 ORDER BY role`,
      [org.id],
    );
    expect(boundRows.map((r) => r.role)).toEqual(['admin_org', 'admin_org', 'operador_org', 'operador_org']);
  });

  it('R22.6 — re-ejecutar el seeder no duplica ningún email y el conteo permanece en 6', async () => {
    // El conteo de los usuarios CON email (i.e. los que el seeder maneja)
    // debe permanecer en 6. La fila `anonymous` de 0001 está fuera del
    // scope del seeder (no tiene email) — la incluimos en el total pero
    // no en la verificación de idempotencia.
    const beforeEmails = await db.rows<{ email: string }>(
      `SELECT email FROM users WHERE email IS NOT NULL ORDER BY email`,
    );
    const beforeCount = beforeEmails.length;
    expect(beforeCount).toBe(6);

    const result = await runUsersSeed();
    // Every row collides on email — none are inserted.
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(6);

    const afterEmails = await db.rows<{ email: string }>(
      `SELECT email FROM users WHERE email IS NOT NULL ORDER BY email`,
    );
    expect(afterEmails.length).toBe(beforeCount);
    expect(afterEmails.map((r) => r.email)).toEqual(beforeEmails.map((r) => r.email));
  });
});
