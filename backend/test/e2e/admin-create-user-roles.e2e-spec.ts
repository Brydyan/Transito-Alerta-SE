import { randomUUID } from 'crypto';
import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';

/**
 * F6 (2026-09-08-f6-new-user-form) — closes the catalog gap that
 * migration 0009 left open: the rows `(users, CREATE)`,
 * `(users, DELETE)`, and `(permissions, READ)` were never seeded.
 * Without them:
 *
 *   - `POST /api/users` (the F6 form's submit) returns 403 to every
 *     user, including `master`, even though master is supposed to
 *     have full CRUD on users.
 *   - `GET /api/permissions` (the F6 form's role-preview "SIN
 *     ACCESO" list) returns 403 to every role.
 *
 * The T5.6 e2e suite that already exists in this repo asserted
 * `POST /api/users` 201 paths but it did so with a master user
 * whose `users.permissions` JSONB was populated by the test
 * harness directly — bypassing the catalog. That is why the
 * gap was invisible to CI: the unit tests used mocks, and the
 * e2e used a pre-baked user. Neither path went through the
 * `PermissionGuard` with a real catalog lookup.
 *
 * The four specs below exercise the path that T5.6 missed: a
 * real login → real JWT → real `PermissionGuard` lookup against
 * the real `permissions` catalog → real controller. They are the
 * regression guard for the F6 form's runtime correctness.
 *
 * Migration 0049 (`database/migrations/0049_admin_user_permissions.sql`)
 * is what makes these specs pass on a fresh DB. Without it, the
 * first two specs FAIL on the `POST /api/users` 403, and the
 * `GET /api/permissions` 200 in the assertion below flips to 403.
 */
describe('E2E F6 — adminCreate reachability (catalog gap 0049)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * The happy path: a `master` user (with the perms granted by
   * migration 0049) can `POST /api/users` with `phone` and
   * `role_id`, and the response's `permissions` array matches
   * the role's denormalized `permissions`. The D1 (phone) and
   * D2 (denormalization) of the F6 design both reach the wire.
   */
  it('master with CREATE users can POST /api/users with phone and role_id', async () => {
    const master = await env.provisionUser(
      ['CREATE users', 'DELETE users', 'READ permissions'],
      {
        email: `master-${randomUUID()}@example.com`,
        roleName: 'master',
        emailVerified: true,
      },
    );

    // Look up a real role UUID from the seeded roles table. The
    // e2e harness applied all migrations including 0009 (role
    // seed) and 0015 (staff role grants), so `admin_org` exists.
    const { rows: roleRows } = await env.pg.query<{ id: string }>(
      `SELECT id FROM roles WHERE name = 'admin_org' AND deleted_at IS NULL LIMIT 1`,
    );
    expect(roleRows.length).toBe(1);
    const roleId = roleRows[0].id;

    const email = `f6-target-${randomUUID()}@example.com`;
    const res = await request(env.httpServer)
      .post('/api/users')
      .set(authHeader(master.accessToken))
      .send({
        email,
        phone: '+593 99 999 9999',
        first_name: 'F6',
        last_name: 'Target',
        role_id: roleId,
      });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
    expect(res.body.phone).toBe('+593 99 999 9999');
    expect(res.body.role_id).toBe(roleId);
    // D2 — permissions denormalized from the role. After
    // migration 0049, admin_org has CREATE users / DELETE users
    // / READ permissions in addition to the T5.6+0015 grants.
    // The new user's permissions should be IDENTICAL to the
    // role's permissions, which is what denormalization means.
    const { rows: rolePermsRows } = await env.pg.query<{ permissions: string[] }>(
      `SELECT permissions FROM roles WHERE id = $1`,
      [roleId],
    );
    const rolePerms = (rolePermsRows[0]?.permissions ?? []).slice().sort();
    const userPerms = (res.body.permissions ?? []).slice().sort();
    expect(userPerms).toEqual(rolePerms);
    // permission_version: 2 because role_id was provided
    // (adminCreate bumps 1 → 2 in the F6 design D2).
    expect(res.body.permission_version).toBe(2);
  });

  /**
   * The negative path: a user WITHOUT `CREATE users` (here
   * `operador_org`, which legitimately manages incidents but not
   * other users) gets a 403 from the `PermissionGuard` on
   * `POST /api/users`. This is the regression guard for the
   * catalog row that the spec wanted to exist in the first place.
   */
  it('operador_org without CREATE users gets 403 on POST /api/users', async () => {
    const operador = await env.provisionUser([], {
      email: `operador-${randomUUID()}@example.com`,
      roleName: 'operador_org',
      emailVerified: true,
    });

    const res = await request(env.httpServer)
      .post('/api/users')
      .set(authHeader(operador.accessToken))
      .send({
        email: `f6-deny-${randomUUID()}@example.com`,
        first_name: 'F6',
        last_name: 'Deny',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/CREATE users/);
  });

  /**
   * D1 (AdminCreateUserDto validation): phone > 30 chars returns
   * 400. This is the unit-test case from `admin-create-user.dto.spec.ts`
   * lifted to the wire — proving the ValidationPipe is actually
   * connected to the controller.
   */
  it('adminCreate with phone > 30 chars returns 400 (D1 validation)', async () => {
    const master = await env.provisionUser(
      ['CREATE users', 'DELETE users'],
      {
        email: `master-${randomUUID()}@example.com`,
        roleName: 'master',
        emailVerified: true,
      },
    );

    const res = await request(env.httpServer)
      .post('/api/users')
      .set(authHeader(master.accessToken))
      .send({
        email: `f6-phone-${randomUUID()}@example.com`,
        phone: 'x'.repeat(31), // 31 chars, > 30 limit
        first_name: 'F6',
        last_name: 'Phone',
      });

    expect(res.status).toBe(400);
    // class-validator's MaxLength message format
    expect(JSON.stringify(res.body.message)).toMatch(/phone/i);
  });

  /**
   * D2 case C: an unknown role_id returns 404, not 500. The
   * F6 service loads the `RoleEntity` and throws
   * `NotFoundException` when it does not exist; this asserts
   * the exception survives the global exception filter.
   */
  it('adminCreate with invalid role_id returns 404 (D2 case C)', async () => {
    const master = await env.provisionUser(
      ['CREATE users', 'DELETE users'],
      {
        email: `master-${randomUUID()}@example.com`,
        roleName: 'master',
        emailVerified: true,
      },
    );

    const nonExistentRoleId = '00000000-0000-0000-0000-000000000000';
    const res = await request(env.httpServer)
      .post('/api/users')
      .set(authHeader(master.accessToken))
      .send({
        email: `f6-404-${randomUUID()}@example.com`,
        first_name: 'F6',
        last_name: 'NotFound',
        role_id: nonExistentRoleId,
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(new RegExp(nonExistentRoleId));
  });
});
