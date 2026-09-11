import { MigrationHarness } from '../support/migration-harness';

describe('F4 - Migration 0053 (Citizen Social Features)', () => {
  let db: MigrationHarness;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    // F6 took 0049 (admin_user_permissions, applied 2026-09-09) before this
    // migration landed, so the F4 social-features migration is 0053. The base
    // is 0048: the migrations between 0048 and 0053 (0049/0050/0051/0052) are
    // F6 housekeeping and irrelevant to this test.
    await db.applyRange({ to: '0048' });
  }, 180_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  it('A.1.8 - on a base with pre-existing users, their users.permissions contains the new permissions', async () => {
    // 1. Insert a role if needed, or get one.
    const roles = await db.rows<{ id: string; name: string; permissions: any }>('SELECT * FROM roles WHERE name = $1', ['operador_sistema']);
    expect(roles.length).toBeGreaterThan(0);
    const roleId = roles[0].id;

    // 2. Insert a user
    const [{ id: userId }] = await db.rows<{ id: string }>(`
      INSERT INTO users (email, role_id, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id
    `, ['test_user_f4@example.com', roleId, 'hash']);

    // 3. Set their permissions to the old role permissions
    await db.client.query('UPDATE users SET permissions = $1::jsonb, permission_version = 1 WHERE id = $2', [JSON.stringify(roles[0].permissions), userId]);

    // 4. Verify old permissions don't have the new ones
    let user = (await db.rows<{ permissions: string[], permission_version: number }>('SELECT permissions, permission_version FROM users WHERE id = $1', [userId]))[0];
    expect(user.permissions).not.toContain('CREATE incident-followers');

    // 5. Apply 0053
    await db.applyVersion('0053');

    // 6. Verify role permissions got updated
    const updatedRole = (await db.rows<{ permissions: string[] }>('SELECT permissions FROM roles WHERE id = $1', [roleId]))[0];
    expect(updatedRole.permissions).toContain('CREATE incident-followers');
    expect(updatedRole.permissions).toContain('DELETE incident-followers');
    expect(updatedRole.permissions).toContain('CREATE incident-corroborations');

    // 7. Verify user permissions got updated
    user = (await db.rows<{ permissions: string[], permission_version: number }>('SELECT permissions, permission_version FROM users WHERE id = $1', [userId]))[0];
    expect(user.permissions).toContain('CREATE incident-followers');
    expect(user.permissions).toContain('DELETE incident-followers');
    expect(user.permissions).toContain('CREATE incident-corroborations');
    expect(user.permission_version).toBe(2);
  });
});
