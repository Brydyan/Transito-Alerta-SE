import request from 'supertest';

import { MailService, MAIL_DEAD_STREAM_KEY, MAIL_OUTBOX_STREAM_KEY } from '../../src/modules/mail/mail.service';
import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

const MAIL_CONSUMER_GROUP = 'mail';

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 15_000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error('waitUntil: condition never became true within the timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Mail module e2e (T3.5). Real Postgres, real Redis (Testcontainers,
 * `redis:7-alpine`), the real running app — no mocked Redis seam, unlike
 * the unit specs. SMTP_HOST is unset in this harness (log-only fallback),
 * so `MailService.deliver` is spied per-test to make transient-failure /
 * dead-letter scenarios deterministic without a real SMTP server.
 */
describe('Mail module e2e (T3.5)', () => {
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
    // env.reset() deliberately does not flushdb the streams database (it
    // would delete incidents:events' own consumer groups too — see its
    // comment) — trim mail:outbox/mail:dead entries left over from the
    // previous test instead. MAXLEN 0 clears entries but preserves the
    // key and any consumer group already registered on it, so the
    // already-running MailOutboxConsumer/IncidentMailListener loops never
    // see a NOGROUP error.
    await env.redisStreams.xtrim(MAIL_OUTBOX_STREAM_KEY, 'MAXLEN', 0);
    await env.redisStreams.xtrim(MAIL_DEAD_STREAM_KEY, 'MAXLEN', 0);
  });

  async function pendingCount(): Promise<number> {
    const summary = (await env.redisStreams.xpending(MAIL_OUTBOX_STREAM_KEY, MAIL_CONSUMER_GROUP)) as unknown as [
      number,
      string | null,
      string | null,
      unknown,
    ];
    return summary[0];
  }

  it('enqueue -> deliver (log-only, SMTP unconfigured) -> XACK', async () => {
    const deliverSpy = jest.spyOn(mailService, 'deliver');

    await mailService.enqueue({
      to: 'reporter@example.com',
      subject: 'Test enqueue',
      template: 'incident.created',
      data: { title: 'Incidente de prueba', description: 'desc' },
    });

    await waitUntil(async () => deliverSpy.mock.calls.length > 0 && (await pendingCount()) === 0);

    expect(deliverSpy).toHaveBeenCalledWith(
      'reporter@example.com',
      'Test enqueue',
      'incident.created',
      expect.objectContaining({ title: 'Incidente de prueba' }),
    );
  });

  it(
    'a stalled entry (transient delivery failure) is claimed by the sweep and successfully retried',
    async () => {
      let calls = 0;
      jest.spyOn(mailService, 'deliver').mockImplementation(async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('simulated transient SMTP failure');
        }
      });

      await mailService.enqueue({
        to: 'stalled@example.com',
        subject: 'Retry me',
        template: 'incident.created',
        data: { title: 'x', description: 'y' },
      });

      // First attempt fails and is left pending (no XACK) — proves the
      // failure really did leave it there before asserting recovery.
      await waitUntil(async () => calls >= 1);
      expect(await pendingCount()).toBeGreaterThan(0);

      // The sweep (MAIL_SWEEP_INTERVAL_MS=300, MAIL_CLAIM_IDLE_MS=500 in
      // this harness — see test-environment.ts) reclaims it and retries;
      // the second call succeeds, so it is finally XACKed.
      await waitUntil(async () => calls >= 2 && (await pendingCount()) === 0, 20_000);

      expect(calls).toBeGreaterThanOrEqual(2);
    },
    30_000,
  );

  it('incident.created event -> IncidentMailListener enqueues -> MailOutboxConsumer delivers to the reporter', async () => {
    const deliverSpy = jest.spyOn(mailService, 'deliver');

    const reporter: ProvisionedUser = await env.provisionUser(['READ incidents', 'CREATE incidents'], {
      email: 'reporter-e2e@example.com',
    });

    await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ title: 'Choque en la via', description: 'Sin heridos', lat: -2.2, lng: -80.5 })
      .expect(201);

    await waitUntil(
      async () =>
        deliverSpy.mock.calls.some(
          (call) => call[0] === 'reporter-e2e@example.com' && call[2] === 'incident.created',
        ),
      20_000,
    );

    expect(deliverSpy).toHaveBeenCalledWith(
      'reporter-e2e@example.com',
      expect.any(String),
      'incident.created',
      expect.objectContaining({ title: 'Choque en la via' }),
    );
  });

  it('an entry that fails delivery 3 times is moved to mail:dead and acked on the origin stream', async () => {
    jest.spyOn(mailService, 'deliver').mockRejectedValue(new Error('permanent simulated failure'));

    await mailService.enqueue({
      to: 'dead-letter@example.com',
      subject: 'Will fail',
      template: 'incident.created',
      data: { title: 'x', description: 'y' },
    });

    await waitUntil(async () => {
      const dead = await env.redisStreams.xrange(MAIL_DEAD_STREAM_KEY, '-', '+');
      return dead.some((entry) => entry[1].includes('dead-letter@example.com'));
    }, 30_000);

    expect(await pendingCount()).toBe(0);
  }, 45_000);
});
