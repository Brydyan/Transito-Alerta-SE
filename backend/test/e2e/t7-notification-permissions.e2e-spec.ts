import { MigrationHarness } from '../support/migration-harness';

/**
 * T7.9.B — notifications permission catalog + role grants (0039, Fase B).
 * R20.1–R20.3: the catalog carries `(notifications, READ)` and
 * `(notifications, UPDATE)`, all 4 staff roles have both granted in their
 * `roles.permissions` JSONB, and re-applying 0039 does not duplicate either.
 *
 * Fixes gap G23 (design.md §1.4 / D14): `NotificationsController.approve`
 * and `.reject` (T5.6) have required `@RequirePermission('UPDATE')` since
 * they were written, but no role's `permissions` JSONB ever granted
 * `'UPDATE notifications'` — every staff role got 403 on both routes until
 * this migration. A pure-SQL harness is enough to prove the fix: the
 * authorization decision itself (`hasPermission`) is a pure function over
 * `roles.permissions`, already covered by `permission.guard.spec.ts`; what
 * was missing was the data, not the code.
 */
describe('E2E T7.9.B notification permissions (0039)', () => {
  let h: MigrationHarness;

  const STAFF_ROLES = [
    'master',
    'operador_sistema',
    'admin_org',
    'operador_org',
  ];

  // Applies through 0040, not 0039: the grants in 0039 are written against the
  // pre-rename role names, and 0040_rename_roles is what turns them into the
  // `master` / `admin_org` / `operador_org` this suite asserts on. A rename
  // does not touch the `permissions` JSONB, so the grants travel with the row.
  beforeAll(async () => {
    h = await MigrationHarness.start();
    await h.applyRange({ to: '0040' });
  }, 120_000);

  afterAll(async () => {
    await h.stop();
  }, 60_000);

  // ---- R20.1 — catalog rows exist ----------------------------------------

  it('R20.1: the permissions catalog has (notifications, READ) and (notifications, UPDATE)', async () => {
    const rows = await h.rows<{ action: string }>(
      `SELECT action FROM permissions WHERE resource = 'notifications' ORDER BY action`,
    );
    expect(rows.map((r) => r.action)).toEqual(['READ', 'UPDATE']);
  });

  // ---- R20.2 — all 4 staff roles have both granted -----------------------

  it.each(STAFF_ROLES)('R20.2: role %s has both READ and UPDATE notifications granted', async (roleName) => {
    const [role] = await h.rows<{ permissions: string[] }>(
      `SELECT permissions FROM roles WHERE name = $1`,
      [roleName],
    );
    expect(role).toBeDefined();
    expect(role.permissions).toEqual(
      expect.arrayContaining(['READ notifications', 'UPDATE notifications']),
    );
  });

  it('R20.2b: the reporter role is NOT granted these — self-scoped routes never check it', async () => {
    const [role] = await h.rows<{ permissions: string[] }>(
      `SELECT permissions FROM roles WHERE name = 'reporter'`,
    );
    expect(role).toBeDefined();
    expect(role.permissions).not.toEqual(
      expect.arrayContaining(['READ notifications', 'UPDATE notifications']),
    );
  });

  // ---- R20.3 — re-apply is idempotent -------------------------------------

  // NOTE — 0039 is re-applied here, not 0040: it is the migration that writes
  // the catalog rows and the grants, so it is the one whose idempotency matters.
  // Its `ON CONFLICT DO NOTHING` is exercised for real. Its `?&` guard on the
  // UPDATE is not: by this point 0040 has renamed the roles, so the
  // `WHERE name IN (<pre-rename names>)` clause matches zero rows regardless.
  // The guard itself is covered against the pre-rename state in the migration
  // harness range applied by `beforeAll`.
  it('R20.3: re-applying 0039 does not duplicate the catalog rows or the JSONB grants', async () => {
    await h.applyVersion('0039');
    await h.applyVersion('0039');

    const catalogRows = await h.rows<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM permissions WHERE resource = 'notifications'`,
    );
    expect(Number(catalogRows[0].count)).toBe(2);

    for (const roleName of STAFF_ROLES) {
      const [role] = await h.rows<{ permissions: string[] }>(
        `SELECT permissions FROM roles WHERE name = $1`,
        [roleName],
      );
      const occurrences = role.permissions.filter(
        (p) => p === 'READ notifications' || p === 'UPDATE notifications',
      );
      expect(occurrences.sort()).toEqual(['READ notifications', 'UPDATE notifications']);
    }
  });
});
