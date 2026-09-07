import { readFileSync } from 'fs';
import { resolve } from 'path';

import { MigrationHarness } from '../support/migration-harness';

/**
 * T8 (E2E — Usuario de pruebas y credenciales reales) — `database/seeds/users.js`
 * siembra `e2e@tase.local` con rol `operador_org` cuando `E2E_PASSWORD` está
 * definida, y NO la siembra cuando no lo está. El usuario es propio, no uno de
 * los seis de demo, y su contraseña nunca es una constante del repo.
 *
 * Diseño (D2 + D3 del change `2026-09-03-e2e-test-user-and-credentials`):
 *   - `E2E_PASSWORD` es un secret del runner, separado de `SEED_PASSWORD`.
 *   - Sin `E2E_PASSWORD` → el usuario e2e no se crea (avería disfrazada de
 *     decisión si lo sembráramos con una contraseña por defecto).
 *   - Re-correr el seeder no duplica (mismo `ON CONFLICT (email) DO NOTHING`).
 *   - El usuario e2e nunca es `master` ni `operador_sistema`: atraviesa los
 *     guards como un usuario real.
 *
 * El scenario "sin valor por defecto" se verifica sobre el código fuente
 * (A.5): un test de comportamiento no distingue "no hay default" de
 * "el default no se usó en este camino". Si alguien pega mañana una
 * constante `DEFAULT_E2E_PASSWORD = 'algo'`, este test lo caza.
 */
describe('T8 — database/seeds/users.js siembra e2e@tase.local (E2E_PASSWORD)', () => {
  const REPO_ROOT = resolve(__dirname, '../../..');
  const USERS_SEED_PATH = resolve(REPO_ROOT, 'database/seeds/users.js');
  const USERS_SEED_SOURCE = readFileSync(USERS_SEED_PATH, 'utf8');

  let db: MigrationHarness;
  const SEED_PASSWORD = 'TestP4ss!Seed';
  const E2E_PASSWORD = 'TestP4ss!E2E';

  beforeAll(async () => {
    db = await MigrationHarness.start();
    await db.applyRange({ to: '0041' });
    process.env.DATABASE_URL = db.databaseUrl;
    process.env.SEED_PASSWORD = SEED_PASSWORD;
    process.env.SEED_ALLOW_LOCALHOST = '1';
    process.env.SEED_ALLOW_PRODUCTION = '1';
    process.env.NODE_ENV = 'test';
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function loadSeed(): { run: (client: any, opts?: any) => Promise<{ inserted: number; skipped: number; users: any[] }> } {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    delete (require as any).cache[USERS_SEED_PATH];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(USERS_SEED_PATH);
  }

  // Recolecta el usuario e2e por email; null si no se creó.
  async function fetchE2eUser(): Promise<{
    email: string;
    role: string;
    organization_id: string | null;
  } | null> {
    const rows = await db.rows<{ email: string; role: string; organization_id: string | null }>(
      `SELECT email, role, organization_id
         FROM users
        WHERE email = 'e2e@tase.local' AND deleted_at IS NULL`,
    );
    return rows[0] ?? null;
  }

  async function clearE2eUser(): Promise<void> {
    await db.rows(`DELETE FROM users WHERE email = 'e2e@tase.local'`);
  }

  it('Sin valor por defecto — el código no contiene una constante DEFAULT_E2E_PASSWORD', () => {
    // A.5: la verificación es sobre el código fuente, no sobre el
    // comportamiento. Un test de runtime no distingue "no hay default"
    // de "el default no se usó en este camino".
    //
    // La regex exige una DECLARACIÓN de constante (`const … =`), no
    // una mención en un comentario: si mañana alguien redacta un
    // comentario explicando por qué no hay default, este test no
    // debería caer.
    expect(USERS_SEED_SOURCE).not.toMatch(/const\s+DEFAULT_E2E_PASSWORD/);
    // Y, por simetría, ninguna asignación de literal con un valor
    // hard-coded para E2E_PASSWORD. (Si alguien intenta evadir el
    // check cambiando el nombre de la constante, esta segunda red
    // lo cacha.)
    expect(USERS_SEED_SOURCE).not.toMatch(/E2E_PASSWORD\s*=\s*['"]/);
  });

  it('Sembrado — con E2E_PASSWORD se crea e2e@tase.local como operador_org', async () => {
    await clearE2eUser();
    delete process.env.E2E_PASSWORD;
    process.env.E2E_PASSWORD = E2E_PASSWORD;

    const mod = loadSeed();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await mod.run((db as any).client, {
      force: true,
      seed: { password: SEED_PASSWORD },
    });

    const e2eUser = result.users.find((u) => u.email === 'e2e@tase.local');
    expect(e2eUser).toBeDefined();
    expect(e2eUser?.role).toBe('operador_org');
    expect(e2eUser?.inserted).toBe(true);

    const row = await fetchE2eUser();
    expect(row).not.toBeNull();
    expect(row?.role).toBe('operador_org');
    // organization_id = CTE - Santa Elena (mismo org que los seis de demo
    // con rol organizacional).
    const [org] = await db.rows<{ id: string }>(
      `SELECT id FROM organizations WHERE name = 'CTE - Santa Elena'`,
    );
    expect(org).toBeDefined();
    expect(row?.organization_id).toBe(org.id);
  }, 120_000);

  it('Sin contraseña no se siembra — sin E2E_PASSWORD el usuario e2e no existe', async () => {
    await clearE2eUser();
    delete process.env.E2E_PASSWORD;

    const mod = loadSeed();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await mod.run((db as any).client, {
      force: true,
      seed: { password: SEED_PASSWORD },
    });

    // El seeder devuelve la lista de los seis de demo; el e2e no figura.
    const e2eUser = result.users.find((u) => u.email === 'e2e@tase.local');
    expect(e2eUser).toBeUndefined();
    expect(result.users.length).toBe(6);

    const row = await fetchE2eUser();
    expect(row).toBeNull();

    // Los seis de demo sí están.
    const demo = await db.rows<{ count: string }>(
      `SELECT count(*)::text AS count FROM users WHERE email LIKE '%@tase.local' AND email <> 'e2e@tase.local' AND deleted_at IS NULL`,
    );
    expect(demo[0]?.count).toBe('6');
  }, 120_000);

  it('Idempotente — re-correr el seeder con E2E_PASSWORD no duplica al usuario e2e', async () => {
    await clearE2eUser();
    process.env.E2E_PASSWORD = E2E_PASSWORD;

    const mod = loadSeed();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await mod.run((db as any).client, { force: true, seed: { password: SEED_PASSWORD } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const second = await mod.run((db as any).client, { force: true, seed: { password: SEED_PASSWORD } });

    const e2eEntry = second.users.find((u) => u.email === 'e2e@tase.local');
    expect(e2eEntry?.inserted).toBe(false);
    expect(e2eEntry?.skipped).toBe(true);

    const rows = await db.rows<{ count: string }>(
      `SELECT count(*)::text AS count FROM users WHERE email = 'e2e@tase.local' AND deleted_at IS NULL`,
    );
    expect(rows[0]?.count).toBe('1');
  }, 180_000);

  it('No es master — el usuario e2e no tiene rol master ni operador_sistema', async () => {
    process.env.E2E_PASSWORD = E2E_PASSWORD;

    const row = await fetchE2eUser();
    expect(row).not.toBeNull();
    expect(row?.role).not.toBe('master');
    expect(row?.role).not.toBe('operador_sistema');
  });

  it('Los seis de demo intactos — sembrar el e2e no toca el rol, organización ni hash de los seis', async () => {
    process.env.E2E_PASSWORD = E2E_PASSWORD;

    const before = await db.rows<{
      email: string;
      role: string;
      organization_id: string | null;
      password_hash: string;
    }>(
      `SELECT email, role, organization_id, password_hash
         FROM users
        WHERE email LIKE '%@tase.local' AND email <> 'e2e@tase.local' AND deleted_at IS NULL
        ORDER BY email`,
    );
    expect(before.length).toBe(6);

    const mod = loadSeed();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await mod.run((db as any).client, { force: true, seed: { password: SEED_PASSWORD } });

    const after = await db.rows<{
      email: string;
      role: string;
      organization_id: string | null;
      password_hash: string;
    }>(
      `SELECT email, role, organization_id, password_hash
         FROM users
        WHERE email LIKE '%@tase.local' AND email <> 'e2e@tase.local' AND deleted_at IS NULL
        ORDER BY email`,
    );

    expect(after).toEqual(before);
  }, 180_000);
});
