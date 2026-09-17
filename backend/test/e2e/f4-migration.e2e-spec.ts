import { MigrationHarness } from '../support/migration-harness';

describe('F4 - Migration 0054 (Citizen Social Features)', () => {
  let db: MigrationHarness;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    // F6 took 0049 (admin_user_permissions, applied 2026-09-09), then 0053
    // (audit_logs_permission). F4 social-features migration is now 0054 (was
    // originally 0049, renumbered due to conflict). The base is 0048: the
    // migrations between 0048 and 0054 (0049/0050/0051/0052/0053) are applied
    // before testing 0054.
    await db.applyRange({ to: '0053' });
  }, 180_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  it('A.1.8 - on a base with pre-existing users, their users.permissions contains the new permissions (as UUIDs)', async () => {
    // 1. Insert a role if needed, or get one.
    const roles = await db.rows<{ id: string; name: string; permissions: string[] }>('SELECT * FROM roles WHERE name = $1', ['operador_sistema']);
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

    // 4. Apply 0054 — this migration inserts the new permission catalog rows
    await db.applyVersion('0054');

    // 5. Verify that the new permission rows were inserted by 0054
    const expectedPerms = await db.rows<{ id: string }>(`
      SELECT id FROM permissions
      WHERE (resource, action) IN (('incident-followers', 'CREATE'), ('incident-followers', 'DELETE'), ('incident-corroborations', 'CREATE'))
      AND deleted_at IS NULL
    `);
    expect(expectedPerms.length).toBe(3);
    const expectedUuids = expectedPerms.map(p => p.id);

    // 6. Verify role permissions got updated (now contain UUIDs)
    const updatedRole = (await db.rows<{ permissions: string[] }>('SELECT permissions FROM roles WHERE id = $1', [roleId]))[0];
    expectedUuids.forEach(uuid => {
      expect(updatedRole.permissions).toContain(uuid);
    });

    // 7. Verify user permissions got updated with same UUIDs (bumped to version 2)
    const updatedUser = (await db.rows<{ permissions: string[], permission_version: number }>('SELECT permissions, permission_version FROM users WHERE id = $1', [userId]))[0];
    expectedUuids.forEach(uuid => {
      expect(updatedUser.permissions).toContain(uuid);
    });
    expect(updatedUser.permission_version).toBe(2);
  });
});
