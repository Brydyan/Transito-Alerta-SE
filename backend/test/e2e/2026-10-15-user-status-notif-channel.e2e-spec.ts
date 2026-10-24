import { randomUUID } from 'crypto';
import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';

/**
 * E2E — 2026-10-15-user-status-notif-channel
 *
 * Covers the 4 scenarios that the change introduces on the
 * `PATCH /api/users/:id` route:
 *
 *   S1 (scenarios 1 & 2) — Master toggles another user active/inactive.
 *   S1 (scenario 3)       — Self-deactivation returns 403.
 *   S2 (scenario 1)       — `preferred_notification_channel: telegram`
 *                           persists in the DB.
 *   S2 (scenario 3)       — Invalid channel (`sms`) is rejected with
 *                           400 by the DTO `@IsIn` validator.
 *
 * Plus the non-master "ignored field" scenario from spec S1:
 *   S1 (scenario 4)       — A non-master caller sends `is_active`
 *                           and the service drops it (`target.isActive`
 *                           stays as loaded).
 *
 * Master is provisioned with `UPDATE users` permission via the
 * permission catalog (0009 → 0049 grants). The target user is
 * provisioned via `env.provisionUser` so we get a clean DB row with
 * `is_active = true`. Each spec runs against `env.reset()` so no
 * state leaks between cases.
 */
describe('E2E — 2026-10-15-user-status-notif-channel', () => {
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
   * Provisions a target user with `is_active = true` (default). The
   * master caller has `UPDATE users` permission (granted to `master`
   * by migration 0015 + 0049). Returns the target id.
   */
  async function provisionTarget(roleName = 'operator_org'): Promise<string> {
    const target = await env.provisionUser([], {
      email: `target-${randomUUID()}@example.com`,
      roleName,
      emailVerified: true,
    });
    return target.userId;
  }

  // ===== S1 escenario 1: Master deactivates an active user =====
  it('master PATCHes is_active=false on another user → 200 + DB shows is_active=false', async () => {
    const master = await env.provisionUser(['UPDATE users'], {
      email: `master-${randomUUID()}@example.com`,
      roleName: 'master',
      emailVerified: true,
    });
    const targetId = await provisionTarget();

    const res = await request(env.httpServer)
      .patch(`/api/users/${targetId}`)
      .set(authHeader(master.accessToken))
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);

    const { rows } = await env.pg.query<{ is_active: boolean }>(
      'SELECT is_active FROM users WHERE id = $1',
      [targetId],
    );
    expect(rows[0].is_active).toBe(false);
  });

  // ===== S1 escenario 2: Master reactivates an inactive user =====
  it('master PATCHes is_active=true on an inactive user → 200 + DB shows is_active=true', async () => {
    const master = await env.provisionUser(['UPDATE users'], {
      email: `master-${randomUUID()}@example.com`,
      roleName: 'master',
      emailVerified: true,
    });
    const targetId = await provisionTarget();

    // First deactivate (separate PATCH so we exercise reactivation, not "stays false")
    await request(env.httpServer)
      .patch(`/api/users/${targetId}`)
      .set(authHeader(master.accessToken))
      .send({ is_active: false })
      .expect(200);

    const res = await request(env.httpServer)
      .patch(`/api/users/${targetId}`)
      .set(authHeader(master.accessToken))
      .send({ is_active: true });

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(true);

    const { rows } = await env.pg.query<{ is_active: boolean }>(
      'SELECT is_active FROM users WHERE id = $1',
      [targetId],
    );
    expect(rows[0].is_active).toBe(true);
  });

  // ===== S1 escenario 3: Master attempts self-deactivation → 403 =====
  it('master PATCHes is_active=false on themselves → 403', async () => {
    const master = await env.provisionUser(['UPDATE users'], {
      email: `master-${randomUUID()}@example.com`,
      roleName: 'master',
      emailVerified: true,
    });

    const res = await request(env.httpServer)
      .patch(`/api/users/${master.userId}`)
      .set(authHeader(master.accessToken))
      .send({ is_active: false });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Cannot deactivate your own account/i);

    // Defense in depth — the row is untouched.
    const { rows } = await env.pg.query<{ is_active: boolean }>(
      'SELECT is_active FROM users WHERE id = $1',
      [master.userId],
    );
    expect(rows[0].is_active).toBe(true);
  });

  // ===== S1 escenario 4: Non-master sends is_active → field ignored =====
  it('non-master caller PATCHes is_active → 200 but DB stays unchanged (field ignored)', async () => {
    const operador = await env.provisionUser(['UPDATE users'], {
      email: `operador-${randomUUID()}@example.com`,
      roleName: 'operator_org',
      emailVerified: true,
    });
    const targetId = await provisionTarget();

    const res = await request(env.httpServer)
      .patch(`/api/users/${targetId}`)
      .set(authHeader(operador.accessToken))
      .send({ is_active: false });

    // The route still succeeds — only the field application is gated.
    expect(res.status).toBe(200);

    const { rows } = await env.pg.query<{ is_active: boolean }>(
      'SELECT is_active FROM users WHERE id = $1',
      [targetId],
    );
    // Field ignored → stays at the loaded value (provisionUser set true).
    expect(rows[0].is_active).toBe(true);
  });

  // ===== S2 escenario 1: PATCH preferred_notification_channel=telegram =====
  it('PATCH preferred_notification_channel=telegram → 200 + DB shows telegram', async () => {
    const master = await env.provisionUser(['UPDATE users'], {
      email: `master-${randomUUID()}@example.com`,
      roleName: 'master',
      emailVerified: true,
    });
    const targetId = await provisionTarget();

    const res = await request(env.httpServer)
      .patch(`/api/users/${targetId}`)
      .set(authHeader(master.accessToken))
      .send({ preferred_notification_channel: 'telegram' });

    expect(res.status).toBe(200);

    const { rows } = await env.pg.query<{ preferred_notification_channel: string }>(
      'SELECT preferred_notification_channel FROM users WHERE id = $1',
      [targetId],
    );
    expect(rows[0].preferred_notification_channel).toBe('telegram');
  });

  // ===== S2 escenario 3: Invalid channel 'sms' rejected =====
  it('PATCH preferred_notification_channel=sms → 400 validation error', async () => {
    const master = await env.provisionUser(['UPDATE users'], {
      email: `master-${randomUUID()}@example.com`,
      roleName: 'master',
      emailVerified: true,
    });
    const targetId = await provisionTarget();

    const res = await request(env.httpServer)
      .patch(`/api/users/${targetId}`)
      .set(authHeader(master.accessToken))
      .send({ preferred_notification_channel: 'sms' });

    expect(res.status).toBe(400);
    // ValidationPipe shape: message contains the offending field.
    expect(JSON.stringify(res.body)).toMatch(/preferred_notification_channel/);

    // Nothing persisted.
    const { rows } = await env.pg.query<{ preferred_notification_channel: string }>(
      'SELECT preferred_notification_channel FROM users WHERE id = $1',
      [targetId],
    );
    expect(rows[0].preferred_notification_channel).toBe('email');
  });

  // ===== S2 escenario 2: PATCH preferred_notification_channel=email (from telegram) =====
  // verify-report.md W3 — closed the coverage gap for the symmetric
  // "update to a different allowed value" path. The pre-existing
  // unit test only covered the within-unchanged-cell case; this E2E
  // round-trips a telegram → email transition through HTTP.
  it('PATCH preferred_notification_channel=email on a telegram user → 200 + DB shows email', async () => {
    const master = await env.provisionUser(['UPDATE users'], {
      email: `master-${randomUUID()}@example.com`,
      roleName: 'master',
      emailVerified: true,
    });
    const targetId = await provisionTarget();

    // Setup: target starts with the DB default `'email'`. Flip to
    // `'telegram'` first so the transition is observable.
    await request(env.httpServer)
      .patch(`/api/users/${targetId}`)
      .set(authHeader(master.accessToken))
      .send({ preferred_notification_channel: 'telegram' })
      .expect(200);

    // Act: flip back to `email`.
    const res = await request(env.httpServer)
      .patch(`/api/users/${targetId}`)
      .set(authHeader(master.accessToken))
      .send({ preferred_notification_channel: 'email' });

    expect(res.status).toBe(200);
    expect(res.body.preferred_notification_channel).toBe('email');

    // Persistence readback — the column must actually have flipped.
    const { rows } = await env.pg.query<{ preferred_notification_channel: string }>(
      'SELECT preferred_notification_channel FROM users WHERE id = $1',
      [targetId],
    );
    expect(rows[0].preferred_notification_channel).toBe('email');
  });

  // ===== S2 escenario 4: PATCH body without preferred_notification_channel =====
  // verify-report.md W3 — covers the no-op persistence path. A PATCH
  // that omits the field MUST NOT change the stored value; this is
  // the contract of the partial-update semantics the DTO is built on.
  it('PATCH body without preferred_notification_channel leaves the DB value unchanged', async () => {
    const master = await env.provisionUser(['UPDATE users'], {
      email: `master-${randomUUID()}@example.com`,
      roleName: 'master',
      emailVerified: true,
    });
    const targetId = await provisionTarget();

    // Setup: target starts as `email`. Set to `telegram` so the
    // no-op assertion has a non-default value to check.
    await request(env.httpServer)
      .patch(`/api/users/${targetId}`)
      .set(authHeader(master.accessToken))
      .send({ preferred_notification_channel: 'telegram' })
      .expect(200);

    // Act: PATCH an unrelated field. `preferred_notification_channel`
    // is NOT in the body — the service guard `if (dto.preferred_...
    // !== undefined)` skips the assignment.
    const res = await request(env.httpServer)
      .patch(`/api/users/${targetId}`)
      .set(authHeader(master.accessToken))
      .send({ first_name: 'Renombrado' });

    expect(res.status).toBe(200);

    // Persistence readback — the channel must NOT have flipped.
    const { rows } = await env.pg.query<{ preferred_notification_channel: string }>(
      'SELECT preferred_notification_channel FROM users WHERE id = $1',
      [targetId],
    );
    expect(rows[0].preferred_notification_channel).toBe('telegram');
  });

  // ===== S1 escenario 5: Deactivated user gets rejected on next protected request =====
  // verify-report.md S1 — closure for the pre-existing
  // `findAuthContextRow WHERE is_active = TRUE` guard. The actual
  // behavior is a 403 (not a 401) on the next permission-gated
  // request: the JWT middleware still resolves the auth context
  // (returns a zero-permissions `AuthContext`), but the
  // `PermissionGuard` blocks any route with `@RequirePermission`.
  // The spec scenario 5 wording was "401 or 403" (spec s1-is-active-toggle.md
  // scenario "Master attempts to deactivate themselves" tolerates
  // both, and the same tolerance is documented for the deactivated-
  // user-on-next-request path in design.md D2's design rationale).
  //
  // `env.provisionUser` emits a fresh token right after login, so
  // we provision a target, grab its token, deactivate it via a
  // master PATCH, then send a permission-gated request with the
  // now-stale token and assert 403.
  it('deactivated user receives 403 on the next permission-gated request', async () => {
    const master = await env.provisionUser(['UPDATE users'], {
      email: `master-${randomUUID()}@example.com`,
      roleName: 'master',
      emailVerified: true,
    });

    // Provision the target as a user with READ permission so its
    // token can hit a protected route before deactivation. The
    // e2e harness defaults `is_active = true`, which is what we
    // need to verify the BEFORE state.
    const target = await env.provisionUser(['READ users'], {
      email: `target-${randomUUID()}@example.com`,
      roleName: 'operator_org',
      emailVerified: true,
    });

    // Sanity: the target's own token works BEFORE deactivation on
    // the protected `/api/users/:id` endpoint.
    const before = await request(env.httpServer)
      .get(`/api/users/${target.userId}`)
      .set(authHeader(target.accessToken));
    expect(before.status).toBe(200);

    // Master deactivates the target.
    await request(env.httpServer)
      .patch(`/api/users/${target.userId}`)
      .set(authHeader(master.accessToken))
      .send({ is_active: false })
      .expect(200);

    // DB readback to confirm the column actually flipped (the
    // JWT guard reads `is_active` via `findAuthContextRow` on
    // every fresh auth-context lookup — this is the source of
    // the empty-permissions AuthContext that fails `PermissionGuard`).
    const { rows } = await env.pg.query<{ is_active: boolean }>(
      'SELECT is_active FROM users WHERE id = $1',
      [target.userId],
    );
    expect(rows[0].is_active).toBe(false);

    // The target's pre-deactivation token must now reject on a
    // permission-gated route. The `PermissionGuard` denies the
    // zero-permissions `AuthContext` with 403.
    const after = await request(env.httpServer)
      .get(`/api/users/${target.userId}`)
      .set(authHeader(target.accessToken));
    expect(after.status).toBe(403);
  });
});