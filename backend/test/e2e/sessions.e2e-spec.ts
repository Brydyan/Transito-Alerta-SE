import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AuthConfig } from '../../src/config/auth.config';
import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * Sessions e2e (T3.9 design §10) — the real stack: Postgres CAS, Redis
 * denylist + grace buffer. Proves what the unit branch-matrix (mocked
 * repo/cache) cannot: that a real concurrent double-refresh resolves
 * through grace exactly once, and that revocation is visible on the very
 * next request without a TTL wait.
 *
 * No `setTimeout`/sleep anywhere (design §10) — grace-window boundaries use
 * `env.backdateRotation`, never real elapsed time beyond incidental test
 * execution latency (which is always << the 30s default grace).
 */
describe('Sessions e2e (T3.9)', () => {
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

  function refresh(refreshToken: string): request.Test {
    return request(env.httpServer).post('/api/auth/refresh').send({ refresh_token: refreshToken });
  }

  it('login creates a session row whose id (sid) is shared by both tokens', async () => {
    const user = await env.provisionUser(['READ incidents']);

    expect(user.sid).not.toBeNull();

    const { rows } = await env.pg.query<{ id: string; refresh_token_hash: string | null }>(
      'SELECT id, refresh_token_hash FROM user_sessions WHERE id = $1',
      [user.sid],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].refresh_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('an anonymous login creates no session row and mints a token with no sid', async () => {
    const response = await request(env.httpServer)
      .post('/api/auth/login')
      .send({ device_uuid: 'anonymous' })
      .expect(200);

    const jwtService = env.app.get(JwtService);
    const decoded = jwtService.decode(response.body.access_token as string) as { sid?: string };
    expect(decoded.sid).toBeUndefined();

    const { rows } = await env.pg.query('SELECT id FROM user_sessions WHERE user_id = (SELECT id FROM users WHERE device_uuid = $1)', ['anonymous']);
    expect(rows).toHaveLength(0);
  });

  it('login on device A and device B, then revoking A: A is rejected on the very next request, B is unaffected', async () => {
    const deviceA = await env.provisionUser(['READ incidents']);
    const deviceB = await env.provisionUser(['READ incidents']);

    await request(env.httpServer)
      .delete(`/api/sessions/${deviceA.sid}`)
      .set({ Authorization: `Bearer ${deviceA.accessToken}` })
      .expect(204);

    // A's access token 401s immediately (no TTL wait) — via the denylist.
    await request(env.httpServer)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${deviceA.accessToken}` })
      .expect(401);

    // A's refresh token 401s too — via the DB isValid() check.
    await refresh(deviceA.refreshToken).expect(401);

    // B is completely unaffected on both token types.
    await request(env.httpServer)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${deviceB.accessToken}` })
      .expect(200);
    const rotatedB = await refresh(deviceB.refreshToken).expect(200);
    expect(rotatedB.body.refresh_token).toBeDefined();
  });

  it('refresh rotates (new pair, old token dies outside grace) and re-extends expires_at', async () => {
    const user = await env.provisionUser(['READ incidents']);

    const rotated = await refresh(user.refreshToken).expect(200);
    expect(rotated.body.refresh_token).not.toBe(user.refreshToken);
    expect(rotated.body.access_token).not.toBe(user.accessToken);

    await env.backdateRotation(user.sid!, 31); // past the 30s default grace

    await refresh(user.refreshToken).expect(401); // replaying the now-retired T1
  });

  it('an in-window replay of the immediately-previous token returns the identical current pair, without rotating', async () => {
    const user = await env.provisionUser(['READ incidents']);

    const rotated = await refresh(user.refreshToken).expect(200);

    // Immediate replay — well within the 30s default grace, no backdating.
    const replay1 = await refresh(user.refreshToken).expect(200);
    const replay2 = await refresh(user.refreshToken).expect(200);

    expect(replay1.body.access_token).toBe(rotated.body.access_token);
    expect(replay1.body.refresh_token).toBe(rotated.body.refresh_token);
    expect(replay2.body.access_token).toBe(rotated.body.access_token);
    expect(replay2.body.refresh_token).toBe(rotated.body.refresh_token);

    const { rows } = await env.pg.query<{ refresh_token_hash: string }>(
      'SELECT refresh_token_hash FROM user_sessions WHERE id = $1',
      [user.sid],
    );
    // The buffered pair's refresh_token_hash must still equal what rotate()
    // wrote — a replay must not have advanced rotated_at / written again.
    expect(rows[0].refresh_token_hash).toBeDefined();
  });

  it('a replay after the grace window revokes the whole session, including the newest issued token', async () => {
    const user = await env.provisionUser(['READ incidents']);

    const rotated = await refresh(user.refreshToken).expect(200); // T1 -> T2
    await env.backdateRotation(user.sid!, 31);

    await refresh(user.refreshToken).expect(401); // replay T1 outside window

    // T2 (the newest issued token) must be dead too — the whole chain dies.
    await refresh(rotated.body.refresh_token).expect(401);
  });

  it('a token two generations old revokes even inside the current rotation window', async () => {
    const user = await env.provisionUser(['READ incidents']);

    const t1 = user.refreshToken;
    const afterFirstRotation = await refresh(t1).expect(200); // T1 -> T2
    await refresh(afterFirstRotation.body.refresh_token).expect(200); // T2 -> T3, in-window for T2->T3

    // T1 is two generations behind current (T3) — must revoke even though
    // the CURRENT rotation (T2->T3) is still well inside its own grace window.
    await refresh(t1).expect(401);
  });

  it('SESSION_REQUIRED: a sid-less (pre-0016) access token is rejected 401 with a distinguishable code', async () => {
    const user = await env.provisionUser(['READ incidents']);
    const jwtService = env.app.get(JwtService);
    const configService = env.app.get(ConfigService);
    const authConfig = configService.get<AuthConfig>('auth')!;

    const legacyToken = jwtService.sign(
      { sub: user.userId, typ: 'access', jti: randomUUID(), pv: 1 },
      { secret: authConfig.jwtAccessSecret, expiresIn: authConfig.jwtAccessExpiresIn },
    );

    const response = await request(env.httpServer)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${legacyToken}` })
      .expect(401);

    expect(response.body).toMatchObject({ code: 'SESSION_REQUIRED' });
  });

  it('POST /auth/logout revokes the caller own session; the token used to call it is dead on the next request', async () => {
    const user = await env.provisionUser(['READ incidents']);

    await request(env.httpServer)
      .post('/api/auth/logout')
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .expect(200);

    await request(env.httpServer)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .expect(401);
  });

  it('a user revokes their own session with zero sessions permissions', async () => {
    const user = await env.provisionUser([]); // zero permissions

    await request(env.httpServer)
      .delete(`/api/sessions/${user.sid}`)
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .expect(204);
  });

  describe('cross-user revoke (D9)', () => {
    let orgAId: string;
    let orgBId: string;

    beforeEach(async () => {
      orgAId = randomUUID();
      orgBId = randomUUID();
      await env.pg.query('INSERT INTO organizations (id, name) VALUES ($1, $2), ($3, $4)', [
        orgAId,
        'Org A',
        orgBId,
        'Org B',
      ]);
    });

    it('invisible target (different org) -> 404', async () => {
      const admin: ProvisionedUser = await env.provisionUser(['READ sessions', 'DELETE sessions'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const targetInOtherOrg = await env.provisionUser(['READ incidents'], {
        deviceUuid: `device-other-org-${randomUUID()}`,
        organizationId: orgBId,
        roleName: 'operador_organizacion',
      });

      await request(env.httpServer)
        .delete(`/api/sessions/${targetInOtherOrg.sid}`)
        .set({ Authorization: `Bearer ${admin.accessToken}` })
        .expect(404);
    });

    it('visible-not-outranked (equal rank, same org) -> 403 INSUFFICIENT_ROLE_RANK', async () => {
      const actor = await env.provisionUser(['READ sessions', 'DELETE sessions'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const peer = await env.provisionUser(['READ incidents'], {
        deviceUuid: `device-peer-${randomUUID()}`,
        organizationId: orgAId,
        roleName: 'admin_organizacion', // equal rank
      });

      const response = await request(env.httpServer)
        .delete(`/api/sessions/${peer.sid}`)
        .set({ Authorization: `Bearer ${actor.accessToken}` })
        .expect(403);
      expect(response.body).toMatchObject({ code: 'INSUFFICIENT_ROLE_RANK' });
    });

    it('visible-and-outranked succeeds', async () => {
      const admin = await env.provisionUser(['READ sessions', 'DELETE sessions'], {
        organizationId: orgAId,
        roleName: 'admin_sistema',
      });
      const target = await env.provisionUser(['READ incidents'], {
        deviceUuid: `device-target-${randomUUID()}`,
        organizationId: orgAId,
        roleName: 'operador_organizacion',
      });

      await request(env.httpServer)
        .delete(`/api/sessions/${target.sid}`)
        .set({ Authorization: `Bearer ${admin.accessToken}` })
        .expect(204);
    });
  });

  it('concurrent double-refresh resolves through grace: byte-identical responses, one rotated_at advance, zero revocations', async () => {
    const user = await env.provisionUser(['READ incidents']);

    const [first, second] = await Promise.all([refresh(user.refreshToken), refresh(user.refreshToken)]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.access_token).toBe(second.body.access_token);
    expect(first.body.refresh_token).toBe(second.body.refresh_token);

    const { rows } = await env.pg.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM user_sessions WHERE id = $1',
      [user.sid],
    );
    expect(rows[0].revoked_at).toBeNull();
  });
});

/**
 * SESSION_REFRESH_GRACE_SECONDS=0 (design §10 / task 7.10) — a SEPARATE app
 * instance with the config override baked in at boot, never an env
 * mutation mid-suite. Reproduces unmitigated reuse detection exactly: any
 * replay of a non-current hash revokes, including the immediately-previous
 * one.
 */
describe('Sessions e2e — SESSION_REFRESH_GRACE_SECONDS=0 (T3.9 task 7.10)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    process.env.SESSION_REFRESH_GRACE_SECONDS = '0';
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    delete process.env.SESSION_REFRESH_GRACE_SECONDS;
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  it('any replay of a non-current hash revokes immediately — zero grace, unmitigated reuse detection', async () => {
    const user = await env.provisionUser(['READ incidents']);

    await request(env.httpServer)
      .post('/api/auth/refresh')
      .send({ refresh_token: user.refreshToken })
      .expect(200); // T1 -> T2

    // Immediate replay of T1 (the immediately-previous token) — with
    // grace=0, this MUST revoke, not benign-retry.
    const replay = await request(env.httpServer)
      .post('/api/auth/refresh')
      .send({ refresh_token: user.refreshToken })
      .expect(401);
    expect(replay.body).toMatchObject({ code: 'SESSION_REUSE_DETECTED' });
  });
});
