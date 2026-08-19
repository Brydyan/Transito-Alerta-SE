import { randomBytes, randomUUID } from 'crypto';
import request from 'supertest';

import { MailService } from '../../src/modules/mail/mail.service';
import { TestEnvironment } from '../support/test-environment';

/**
 * Invitations + password-identity e2e (T3.6 design "Sequence Flows", tasks
 * 8.11-8.17). Real Postgres + Redis (Testcontainers) + the real running
 * app, exactly like `sessions.e2e-spec.ts` — proves what
 * `invitations.service.spec.ts`'s mocked-repository unit tests cannot: a
 * full HTTP+DB request cycle through guards/pipes/interceptors, real
 * multi-device session state, and (in `invitations-repository.e2e-spec.ts`)
 * real Postgres CAS concurrency.
 *
 * No `setTimeout`/sleep anywhere (design "Testing Strategy") — expiry cases
 * use `env.backdateInvitation`/`env.backdateResetToken` (SQL `UPDATE`),
 * never real elapsed time.
 */
describe('Invitations + password identity e2e (T3.6)', () => {
  let env: TestEnvironment;
  let mailService: MailService;

  beforeAll(async () => {
    env = await TestEnvironment.start();
    mailService = env.app.get(MailService);
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    jest.restoreAllMocks();
  });

  async function roleId(name: string): Promise<string> {
    const { rows } = await env.pg.query<{ id: string }>('SELECT id FROM roles WHERE name = $1', [name]);
    if (!rows[0]) {
      throw new Error(`Seed role "${name}" not found — is 0015 applied?`);
    }
    return rows[0].id;
  }

  function extractToken(link: string): string {
    const token = new URL(link).searchParams.get('token');
    if (!token) {
      throw new Error(`No "token" query param in mailed link: ${link}`);
    }
    return token;
  }

  /**
   * Invites `email` as `roleName`, returns the invitation id and the raw
   * (unhashed) plaintext token — captured from the `MailService.enqueue`
   * call the real `InvitationsService.createInvitation` makes, exactly as
   * an invitee would receive it in their inbox link. Never reads
   * `token_hash` back out of the DB (that is the whole point of hashing).
   */
  async function invite(
    adminAccessToken: string,
    email: string,
    roleName: string,
    organizationId: string | null = null,
  ): Promise<{ id: string; token: string }> {
    const enqueueSpy = jest.spyOn(mailService, 'enqueue');
    const role = await roleId(roleName);

    const response = await request(env.httpServer)
      .post('/api/admin/users/invite')
      .set({ Authorization: `Bearer ${adminAccessToken}` })
      .send({ email, role_id: role, organization_id: organizationId })
      .expect(201);

    const call = enqueueSpy.mock.calls.find((c) => c[0].to === email && c[0].template === 'invitation');
    if (!call) {
      throw new Error(`No "invitation" mail enqueued for ${email}`);
    }
    const link = (call[0].data as { link: string }).link;

    return { id: response.body.id as string, token: extractToken(link) };
  }

  async function requestPasswordReset(email: string): Promise<string> {
    const enqueueSpy = jest.spyOn(mailService, 'enqueue');

    await request(env.httpServer).post('/api/auth/password-reset').send({ email }).expect(202);

    const call = enqueueSpy.mock.calls.find(
      (c) => c[0].to === email && c[0].template === 'password-reset',
    );
    if (!call) {
      throw new Error(`No "password-reset" mail enqueued for ${email}`);
    }
    const link = (call[0].data as { link: string }).link;
    return extractToken(link);
  }

  async function admin(): Promise<string> {
    const user = await env.provisionUser(['CREATE invitations', 'READ invitations', 'DELETE invitations'], {
      roleName: 'admin_sistema',
    });
    return user.accessToken;
  }

  it(
    'full flow: invite -> preview -> accept -> login A -> login B (2 live sessions) -> ' +
      "password reset from B -> A's next request 401 SESSION_REVOKED -> A re-login",
    async () => {
      const adminToken = await admin();
      const email = `invitee-${randomUUID()}@example.com`;
      const password = 'Sup3rSecret!Pass01';

      const { token } = await invite(adminToken, email, 'operador_organizacion');

      const preview = await request(env.httpServer)
        .get(`/api/invitations/preview?token=${encodeURIComponent(token)}`)
        .expect(200);
      expect(preview.body).toMatchObject({ role_name: 'operador_organizacion' });
      expect(preview.body.expires_at).toBeDefined();

      // "login device A" — accept-invitation itself mints the first session.
      const deviceA = await request(env.httpServer)
        .post('/api/auth/accept-invitation')
        .send({ token, password })
        .expect(201);
      expect(deviceA.body.access_token).toBeDefined();
      expect(deviceA.body.refresh_token).toBeDefined();

      const { rows: userRows } = await env.pg.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
        email,
      ]);
      const userId = userRows[0].id;

      // "login device B" — a second, independent {email,password} login.
      const deviceB = await request(env.httpServer)
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
      expect(deviceB.body.access_token).not.toBe(deviceA.body.access_token);

      const { rows: activeBefore } = await env.pg.query(
        'SELECT id FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      expect(activeBefore).toHaveLength(2);

      // "password reset from device B" — request+confirm using the SAME
      // email; the acting device is irrelevant to the reset flow itself.
      const resetToken = await requestPasswordReset(email);
      await request(env.httpServer)
        .post('/api/auth/password-reset/confirm')
        .send({ token: resetToken, password: 'BrandNewPassw0rd!!' })
        .expect(200);

      // Device A's next request is rejected on the very next call, no TTL wait.
      const meA = await request(env.httpServer)
        .get('/api/auth/me')
        .set({ Authorization: `Bearer ${deviceA.body.access_token}` })
        .expect(401);
      expect(meA.body).toMatchObject({ code: 'SESSION_REVOKED' });

      // Device B is revoked too (D5 — revoke-all spares nobody).
      await request(env.httpServer)
        .get('/api/auth/me')
        .set({ Authorization: `Bearer ${deviceB.body.access_token}` })
        .expect(401);

      const { rows: activeAfter } = await env.pg.query(
        'SELECT id FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      expect(activeAfter).toHaveLength(0);

      // Device A re-logs in with the NEW password successfully.
      const relogin = await request(env.httpServer)
        .post('/api/auth/login')
        .send({ email, password: 'BrandNewPassw0rd!!' })
        .expect(200);
      expect(relogin.body.access_token).toBeDefined();
    },
  );

  it('expiry via SQL UPDATE (never sleep): expired invite -> 410 at preview and at accept-invitation', async () => {
    const adminToken = await admin();
    const email = `expiring-${randomUUID()}@example.com`;
    const { id, token } = await invite(adminToken, email, 'operador_organizacion');

    await env.backdateInvitation(id, 48 * 3600 + 60); // 48h + 1min in the past

    const preview = await request(env.httpServer)
      .get(`/api/invitations/preview?token=${encodeURIComponent(token)}`)
      .expect(410);
    expect(preview.body).toMatchObject({ code: 'INVITATION_EXPIRED' });

    const accept = await request(env.httpServer)
      .post('/api/auth/accept-invitation')
      .send({ token, password: 'Sup3rSecret!Pass01' })
      .expect(410);
    expect(accept.body).toMatchObject({ code: 'INVITATION_EXPIRED' });

    const { rows } = await env.pg.query('SELECT id FROM users WHERE email = $1', [email]);
    expect(rows).toHaveLength(0);
  });

  it('concurrent redemption (Promise.all, same token): one 201, one 410 INVITATION_ALREADY_USED, never 409', async () => {
    const adminToken = await admin();
    const email = `concurrent-${randomUUID()}@example.com`;
    const { token } = await invite(adminToken, email, 'operador_organizacion');

    const [first, second] = await Promise.all([
      request(env.httpServer)
        .post('/api/auth/accept-invitation')
        .send({ token, password: 'RaceWinnerPassw0rd!' }),
      request(env.httpServer)
        .post('/api/auth/accept-invitation')
        .send({ token, password: 'RaceLoserPassw0rd!!' }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 410]);

    const loser = first.status === 410 ? first : second;
    expect(loser.body).toMatchObject({ code: 'INVITATION_ALREADY_USED' });

    const { rows } = await env.pg.query('SELECT id FROM users WHERE email = $1', [email]);
    expect(rows).toHaveLength(1);
  });

  it('invalid tokens: unknown -> 404, malformed base64url -> 400 INVALID_TOKEN, reused -> 410', async () => {
    const unknownToken = randomBytes(32).toString('base64url');
    const unknown = await request(env.httpServer)
      .get(`/api/invitations/preview?token=${encodeURIComponent(unknownToken)}`)
      .expect(404);
    expect(unknown.body).toMatchObject({ code: 'INVITATION_NOT_FOUND' });

    const malformed = await request(env.httpServer)
      .get('/api/invitations/preview?token=not-a-valid-token!!')
      .expect(400);
    expect(malformed.body).toMatchObject({ code: 'INVALID_TOKEN' });

    const adminToken = await admin();
    const email = `reused-${randomUUID()}@example.com`;
    const { token } = await invite(adminToken, email, 'operador_organizacion');
    await request(env.httpServer)
      .post('/api/auth/accept-invitation')
      .send({ token, password: 'FirstUsePassw0rd!!!' })
      .expect(201);

    const reused = await request(env.httpServer)
      .post('/api/auth/accept-invitation')
      .send({ token, password: 'SecondUsePassw0rd!!' })
      .expect(410);
    expect(reused.body).toMatchObject({ code: 'INVITATION_ALREADY_USED' });
  });

  it('duplicate invitation to an already-claimed email -> 409 at creation, no invitations row created', async () => {
    const adminToken = await admin();
    const email = `claimed-${randomUUID()}@example.com`;
    const { token } = await invite(adminToken, email, 'operador_organizacion');
    await request(env.httpServer)
      .post('/api/auth/accept-invitation')
      .send({ token, password: 'AlreadyClaimed1Pass!' })
      .expect(201);

    const role = await roleId('operador_organizacion');
    const duplicate = await request(env.httpServer)
      .post('/api/admin/users/invite')
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ email, role_id: role, organization_id: null })
      .expect(409);
    expect(duplicate.body).toMatchObject({ code: 'EMAIL_ALREADY_CLAIMED' });

    const { rows } = await env.pg.query('SELECT id FROM invitations WHERE email = $1 AND accepted_at IS NULL', [
      email,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('unauthorized/malformed invite creation -> 403 (no invitations:CREATE) and 400 (malformed email); no row created either way', async () => {
    const role = await roleId('operador_organizacion');

    // No invitations:CREATE permission at all.
    const nobody = await env.provisionUser(['READ incidents']);
    const forbidden = await request(env.httpServer)
      .post('/api/admin/users/invite')
      .set({ Authorization: `Bearer ${nobody.accessToken}` })
      .send({ email: `forbidden-${randomUUID()}@example.com`, role_id: role, organization_id: null })
      .expect(403);
    expect(forbidden.body.code).not.toBe('EMAIL_ALREADY_CLAIMED');

    // Authorized actor, malformed email — class-validator @IsEmail() 400s
    // before the controller (and therefore the service) ever runs. (tasks.md
    // said "422" — the global ValidationPipe here has no custom
    // exceptionFactory and always throws Nest's default 400 BadRequest, the
    // same correction pattern as the tasks.md "Corrections" table.)
    const adminToken = await admin();
    const malformed = await request(env.httpServer)
      .post('/api/admin/users/invite')
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ email: 'not-an-email', role_id: role, organization_id: null })
      .expect(400);
    expect(malformed.body).toBeDefined();

    const { rows } = await env.pg.query('SELECT id FROM invitations');
    expect(rows).toHaveLength(0);
  });

  it("PUT /auth/password: wrong current_password -> 401; success revokes every session incl. the caller's own", async () => {
    const email = `changepw-${randomUUID()}@example.com`;
    const password = 'OriginalPassw0rd!!!';
    await env.provisionPasswordUser(email, password);

    const login = await request(env.httpServer).post('/api/auth/login').send({ email, password }).expect(200);
    const accessToken = login.body.access_token as string;

    const wrong = await request(env.httpServer)
      .put('/api/auth/password')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ current_password: 'TotallyWrongPassw0rd', new_password: 'NewPassw0rdHere!!!!' })
      .expect(401);
    expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });

    await request(env.httpServer)
      .put('/api/auth/password')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ current_password: password, new_password: 'NewPassw0rdHere!!!!' })
      .expect(200);

    // D5: the token used to CALL the endpoint is dead on the very next
    // request — spares nobody, including the caller's own session.
    const meAfter = await request(env.httpServer)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${accessToken}` })
      .expect(401);
    expect(meAfter.body).toMatchObject({ code: 'SESSION_REVOKED' });

    // The new password logs in successfully; the old one no longer does.
    await request(env.httpServer)
      .post('/api/auth/login')
      .send({ email, password: 'NewPassw0rdHere!!!!' })
      .expect(200);
    await request(env.httpServer).post('/api/auth/login').send({ email, password }).expect(401);
  });
});
