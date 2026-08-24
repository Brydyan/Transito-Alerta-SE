import { createHash, randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';
import { MailService } from '../../src/modules/mail/mail.service';

/**
 * T6.5.D3 — Email OTP verification e2e.
 *  (a) POST /email/resend-verification → 202 + new OTP in DB
 *  (b) POST /email/verify-otp { otp } with correct OTP → 200 + email_verified_at set
 *  (c) verify expired OTP → 422
 *  (d) rate limit: resend twice < 60s → 429
 *  (e) no auth → 401
 */
describe('E2E T6 email verification OTP (T6.5.D3)', () => {
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

  function sha256Hex(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }

  async function provisionEmailUser(): Promise<{ userId: string; accessToken: string; email: string }> {
    const email = `user-${randomUUID()}@example.com`;
    const user = await env.provisionUser([], { email });
    return { userId: user.userId, accessToken: user.accessToken, email };
  }

  // ---- (a) resend-verification generates OTP in DB -------------------------

  it('T6.5.D3a: POST /email/resend-verification → 202 + verification_otp set in DB', async () => {
    const { userId, accessToken } = await provisionEmailUser();

    await request(env.httpServer)
      .post('/api/email/resend-verification')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(202);

    const { rows } = await env.pg.query<{ verification_otp: string | null }>(
      `SELECT verification_otp FROM users WHERE id = $1`,
      [userId],
    );
    expect(rows[0].verification_otp).not.toBeNull();
  });

  // ---- (b) verify OTP correctly sets email_verified_at ----------------------

  it('T6.5.D3b: verify correct OTP → 200 + email_verified_at IS NOT NULL', async () => {
    const { userId, accessToken } = await provisionEmailUser();

    // Spy on mailService.enqueue to capture the plain-text OTP
    const enqueueSpy = jest.spyOn(mailService, 'enqueue');

    await request(env.httpServer)
      .post('/api/email/resend-verification')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(202);

    // Retrieve the plain-text OTP from the enqueued mail (if email was set)
    // or fall back to inserting a known OTP directly.
    const enqueueCall = enqueueSpy.mock.calls[0];
    let plainOtp: string;

    if (enqueueCall) {
      plainOtp = (enqueueCall[0].data as { otp: string }).otp;
    } else {
      // User has no email — service still writes OTP hash. Insert known hash directly.
      plainOtp = '123456';
      const knownHash = sha256Hex(plainOtp);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await env.pg.query(
        `UPDATE users SET verification_otp = $1, verification_otp_expires_at = $2 WHERE id = $3`,
        [knownHash, expiresAt, userId],
      );
    }

    const res = await request(env.httpServer)
      .post('/api/email/verify-otp')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ otp: plainOtp })
      .expect(200);

    expect(res.body.verified).toBe(true);

    const { rows } = await env.pg.query<{ email_verified_at: Date | null }>(
      `SELECT email_verified_at FROM users WHERE id = $1`,
      [userId],
    );
    expect(rows[0].email_verified_at).not.toBeNull();
  });

  // ---- (c) expired OTP → 422 -----------------------------------------------

  it('T6.5.D3c: verify expired OTP → 422', async () => {
    const { userId, accessToken } = await provisionEmailUser();

    // Insert a known OTP hash that is already expired.
    const knownOtp = '654321';
    const hash = sha256Hex(knownOtp);
    const expiredAt = new Date(Date.now() - 60 * 1000); // 1 minute in the past

    await env.pg.query(
      `UPDATE users SET verification_otp = $1, verification_otp_expires_at = $2 WHERE id = $3`,
      [hash, expiredAt, userId],
    );

    await request(env.httpServer)
      .post('/api/email/verify-otp')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ otp: knownOtp })
      .expect(422);
  });

  // ---- (d) rate limit: resend twice < 60s → 429 ---------------------------

  it('T6.5.D3d: resend twice within 60s → second resend returns 429', async () => {
    const { accessToken } = await provisionEmailUser();
    const auth = { Authorization: `Bearer ${accessToken}` };

    // First resend: 202
    await request(env.httpServer)
      .post('/api/email/resend-verification')
      .set(auth)
      .expect(202);

    // Immediate second resend: rate limited → 429
    await request(env.httpServer)
      .post('/api/email/resend-verification')
      .set(auth)
      .expect(429);
  });

  // ---- (e) no auth → 401 ---------------------------------------------------

  it('T6.5.D3e: POST /email/resend-verification without auth → 401', async () => {
    await request(env.httpServer)
      .post('/api/email/resend-verification')
      .expect(401);
  });

  it('T6.5.D3e: POST /email/verify-otp without auth → 401', async () => {
    await request(env.httpServer)
      .post('/api/email/verify-otp')
      .send({ otp: '123456' })
      .expect(401);
  });
});
