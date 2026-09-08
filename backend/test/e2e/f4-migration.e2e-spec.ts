import { MigrationHarness } from '../support/migration-harness';

describe('F4 - Migration 0049 (Citizen Social Features)', () => {
  let db: MigrationHarness;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    // 0048 doesn't exist yet? Wait, let's see which is the latest before 0049.
    // The prompt says "the latest applied is 0042. Actual MIGRATION_LOG lists up to 0047 plus new entries and 0049 is the correct next free number".
    // Apply up to 0048.
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

    // 5. Apply 0049
    await db.applyVersion('0049');

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
