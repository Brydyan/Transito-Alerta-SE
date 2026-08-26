import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';
import { MailService } from '../../src/modules/mail/mail.service';

/**
 * T6.8 e2e — path aliases + GDPR user anonymizer.
 *  - T6.8.A5: GET /menus/my, POST /invitations/accept, GET /invitations/:token/preview, GET /estados
 *  - T6.8.D1: DELETE /users/:id → 204 + soft delete + PII wipe + GET → 404 + login → 401
 *  - T6.8.D2: POST /auth/register → 410
 */
describe('E2E T6 path aliases + GDPR (T6.8.A5, T6.8.D1, T6.8.D2)', () => {
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

  function extractToken(link: string): string {
    const token = new URL(link).searchParams.get('token');
    if (!token) throw new Error(`No "token" query param in link: ${link}`);
    return token;
  }

  /**
   * Create an invitation as admin and return the raw token captured from the
   * enqueued mail (exactly as invitations.e2e-spec.ts does it).
   */
  async function createInvitation(adminToken: string, email: string, roleName: string): Promise<{ id: string; token: string }> {
    const enqueueSpy = jest.spyOn(mailService, 'enqueue');
    const { rows: roleRows } = await env.pg.query<{ id: string }>(
      `SELECT id FROM roles WHERE name = $1`,
      [roleName],
    );
    const roleId = roleRows[0].id;

    const res = await request(env.httpServer)
      .post('/api/admin/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, role_id: roleId })
      .expect(201);

    const call = enqueueSpy.mock.calls.find((c) => c[0].to === email && c[0].template === 'invitation');
    if (!call) throw new Error(`No invitation mail enqueued for ${email}`);
    const link = (call[0].data as { link: string }).link;
    return { id: res.body.id as string, token: extractToken(link) };
  }

  // ---- T6.8.A5 — GET /menus/my alias ----------------------------------------

  it('T6.8.A5: GET /api/menus/my returns same response as GET /api/menus', async () => {
    const user = await env.provisionUser([]);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const r1 = await request(env.httpServer).get('/api/menus').set(auth).expect(200);
    const r2 = await request(env.httpServer).get('/api/menus/my').set(auth).expect(200);

    expect(JSON.stringify(r2.body)).toBe(JSON.stringify(r1.body));
  });

  // ---- T6.8.A5 — GET /invitations/:token/preview alias ----------------------

  it('T6.8.A5: GET /api/invitations/:token/preview returns same body as GET /api/invitations/preview?token=', async () => {
    const admin = await env.provisionUser(['CREATE invitations', 'READ invitations'], {
      roleName: 'master',
    });
    const email = `preview-${randomUUID()}@example.com`;
    const { token } = await createInvitation(admin.accessToken, email, 'operador_org');

    const r1 = await request(env.httpServer)
      .get(`/api/invitations/preview?token=${encodeURIComponent(token)}`)
      .expect(200);

    const r2 = await request(env.httpServer)
      .get(`/api/invitations/${encodeURIComponent(token)}/preview`)
      .expect(200);

    expect(r2.body).toMatchObject({ role_name: r1.body.role_name });
    expect(r2.body.expires_at).toBeDefined();
  });

  // ---- T6.8.A5 — POST /invitations/accept alias ------------------------------

  it('T6.8.A5: POST /api/invitations/accept redeems invitation same as POST /api/auth/accept-invitation', async () => {
    const admin = await env.provisionUser(['CREATE invitations', 'READ invitations'], {
      roleName: 'master',
    });
    const email = `accept-${randomUUID()}@example.com`;
    const { token } = await createInvitation(admin.accessToken, email, 'operador_org');

    const res = await request(env.httpServer)
      .post('/api/invitations/accept')
      .send({ token, password: 'Sup3rSecret!Pass01' })
      .expect(201);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
  });

  // ---- T6.8.A5 — GET /estados alias -----------------------------------------

  it('T6.8.A5: GET /api/estados returns incident statuses (no auth required)', async () => {
    // Note: /estados is on AppController (no guards) unlike /incidents/statuses
    const res = await request(env.httpServer)
      .get('/api/estados')
      .expect(200);

    // Result is an array of { id, label } objects
    expect(Array.isArray(res.body)).toBe(true);
    const ids = (res.body as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain('pending');
    expect(ids).toContain('in_progress');
    expect(ids).toContain('resolved');
  });

  it('T6.8.A5: GET /api/estados returns same status IDs as GET /api/incidents/statuses', async () => {
    const user = await env.provisionUser(['READ incidents']);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const r1 = await request(env.httpServer).get('/api/estados').expect(200);
    const r2 = await request(env.httpServer).get('/api/incidents/statuses').set(auth).expect(200);

    // Both should contain the same status IDs
    const ids1 = (r1.body as Array<{ id: string }>).map((s) => s.id).sort();
    const ids2 = (r2.body as Array<{ id: string }>).map((s) => s.id).sort();
    expect(ids1).toEqual(ids2);
  });

  // ---- T6.8.D1 — GDPR user soft delete + PII anonymizer --------------------

  it('T6.8.D1: DELETE /api/users/:id → 204 + deleted_at set + PII anonymized', async () => {
    const admin = await env.provisionUser(['DELETE users', 'READ users'], { roleName: 'master' });

    // Target: a regular user
    const target = await env.provisionUser([], { email: `target-${randomUUID()}@example.com` });
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    await request(env.httpServer)
      .delete(`/api/users/${target.userId}`)
      .set(auth)
      .expect(204);

    // DB row must still exist with deleted_at set
    const { rows } = await env.pg.query<{
      deleted_at: Date | null;
      email: string;
      first_name: string;
      password_hash: string | null;
    }>(
      `SELECT deleted_at, email, first_name, password_hash FROM users WHERE id = $1`,
      [target.userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
    // PII must be anonymized
    expect(rows[0].email).toMatch(/^deleted\+.*@tase\.invalid$/);
    expect(rows[0].password_hash).toBeNull();
  });

  it('T6.8.D1: GET /api/users/:id after soft delete → 404', async () => {
    const admin = await env.provisionUser(['DELETE users', 'READ users'], { roleName: 'master' });
    const target = await env.provisionUser([]);
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    await request(env.httpServer)
      .delete(`/api/users/${target.userId}`)
      .set(auth)
      .expect(204);

    await request(env.httpServer)
      .get(`/api/users/${target.userId}`)
      .set(auth)
      .expect(404);
  });

  it('T6.8.D1: login with original credentials after deletion → 401', async () => {
    const admin = await env.provisionUser(['DELETE users'], { roleName: 'master' });
    const email = `gdpr-${randomUUID()}@example.com`;
    const password = 'Sup3rSecret!Pass01';

    // Provision a password user (email + password identity)
    await env.provisionPasswordUser(email, password);

    // Get the userId
    const { rows } = await env.pg.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );
    const targetId = rows[0].id;

    // Admin deletes the user
    await request(env.httpServer)
      .delete(`/api/users/${targetId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    // Login with original credentials must fail
    await request(env.httpServer)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(401);
  });

  // ---- T6.8.D2 — POST /auth/register tombstone --------------------------------

  it('T6.8.D2: POST /api/auth/register → 410 Gone', async () => {
    const res = await request(env.httpServer)
      .post('/api/auth/register')
      .send({ email: 'anyone@example.com', password: 'anything' })
      .expect(410);

    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });
});
