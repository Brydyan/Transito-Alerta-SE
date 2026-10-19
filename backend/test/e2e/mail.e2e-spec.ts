import request from 'supertest';
import { randomUUID } from 'crypto';

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
 * the unit specs. SMTP_HOST is forced empty by TestEnvironment (log-only fallback),
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

    // Recreate consumer group to clear any pending entries from the previous
    // test. This ensures pendingCount() starts at 0 for each test.
    try {
      await env.redisStreams.xgroup('DESTROY', MAIL_OUTBOX_STREAM_KEY, MAIL_CONSUMER_GROUP);
    } catch {
      // Group may not exist yet or already destroyed
    }
    try {
      await env.redisStreams.xgroup('CREATE', MAIL_OUTBOX_STREAM_KEY, MAIL_CONSUMER_GROUP, '$', 'MKSTREAM');
    } catch {
      // If it fails, the MailOutboxConsumer will create it on startup
    }
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

  // ───── MAIL (sc-327) — C.4 — el test que habría detectado el defecto ─────

  /**
   * El defecto original: el código encolaba `'email_verification'`,
   * que no estaba en el registro, y el consumer movía la entrada
   * a `mail:dead` sin reintento (`attempts 0` = nunca intentó
   * entregar). Este test corre el camino completo: encolar
   * una entrada con la plantilla nueva, dejar que el consumer
   * la procese, y comprobar que NO está en `mail:dead`.
   *
   * `TestEnvironment` fuerza `SMTP_HOST` vacío, así que `deliverViaSmtp`
   * cae al transporte de sólo-registro y devuelve sin error.
   * El camino se recorre entero sin mandar correo de verdad.
   */
  it('C.4: una entrada con `email_verification` se procesa y NO termina en mail:dead', async () => {
    const deliverSpy = jest.spyOn(mailService, 'deliver');
    const deadCount = async (): Promise<number> => {
      const len = (await env.redisStreams.xlen(MAIL_DEAD_STREAM_KEY)) as number;
      return len;
    };

    const before = await deadCount();

    await mailService.enqueue({
      to: 'reporter@example.com',
      subject: 'Your email verification code',
      template: 'email_verification',
      data: { otp: '408736', expiresMinutes: 15 },
    });

    // El consumer toma la entrada y llama `deliver`. Sin
    // Con SMTP_HOST vacío cae al log-only, no falla, y la entrada se
    // XACK. La presencia de `deliver` confirma que el
    // render corrió — si el template no existiera, la
    // excepción habría aparecido como `mail:dead`.
    await waitUntil(
      async () => deliverSpy.mock.calls.length > 0 && (await pendingCount()) === 0,
      15_000,
    );

    // La entrada NO está en mail:dead.
    expect(await deadCount()).toBe(before);

    // Y la llamada a `deliver` ocurrió con los datos del
    // template (no con la entrada muerta). Esta es la
    // diferencia con el bug original: el `attempts 0` ya no
    // es posible, porque el render se ejecutó.
    expect(deliverSpy).toHaveBeenCalledWith(
      'reporter@example.com',
      'Your email verification code',
      'email_verification',
      expect.objectContaining({ otp: '408736', expiresMinutes: 15 }),
    );
  });

  it('C.4: una entrada con `existing_account_attempt` se procesa y NO termina en mail:dead', async () => {
    const deliverSpy = jest.spyOn(mailService, 'deliver');
    const deadCount = async (): Promise<number> => {
      const len = (await env.redisStreams.xlen(MAIL_DEAD_STREAM_KEY)) as number;
      return len;
    };
    const before = await deadCount();

    await mailService.enqueue({
      to: 'titular@example.com',
      subject: 'Se intentó crear una cuenta con tu correo',
      template: 'existing_account_attempt',
      data: {
        ip: '190.15.142.87',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
        attemptedAt: '2026-09-06T19:33:41.123Z',
      },
    });

    await waitUntil(
      async () => deliverSpy.mock.calls.length > 0 && (await pendingCount()) === 0,
      15_000,
    );

    expect(await deadCount()).toBe(before);
    expect(deliverSpy).toHaveBeenCalledWith(
      'titular@example.com',
      'Se intentó crear una cuenta con tu correo',
      'existing_account_attempt',
      expect.objectContaining({
        ip: '190.15.142.87',
        attemptedAt: '2026-09-06T19:33:41.123Z',
      }),
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

  /**
   * 2026-10-19-fix(mail) — pre-fix this asserted that the reporter
   * received an «acuse de recibo» on every incident.created. The
   * new contract (commit 925368c2e668cc82) is:
   *   - the reporter NEVER receives an email on creation;
   *   - the email fires ONLY when `priority === 'critical'` AND
   *     `organization_id` is resolved;
   *   - the audience is `admin_org` users of the resolved org.
   *
   * This e2e mirrors the new contract end-to-end (real Postgres,
   * real Redis, real running IncidentMailListener + MailOutboxConsumer).
   * To exercise the full publish→consume path with a non-null
   * `organization_id` in the stream entry we rely on the seeded
   * Santa Elena zone plus a freshly-inserted org matching its
   * `zone_id` — same shape used by `t6-organizations-notified`.
   */
  const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';
  const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

  async function seedOrgInZone(): Promise<string> {
    // `reset()` truncates incidents/users but NOT organizations;
    // clean up any leftover org on the SEED zone so the UNIQUE
    // partial index doesn't block our insert (same defensive
    // shape as t6-organizations-notified.e2e-spec.ts).
    await env.pg.query(`DELETE FROM organizations WHERE zone_id = $1`, [
      SANTA_ELENA_ZONE_ID,
    ]);
    const orgId = randomUUID();
    // incident_category_id = NULL → transversal: matches any
    // category, so a `priority: critical` incident in this zone
    // resolves cleanly to this org.
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id, max_active_claims, incident_category_id)
       VALUES ($1, $2, $3, 5, NULL)`,
      [orgId, `Mail-E2E Org ${orgId.slice(0, 8)}`, SANTA_ELENA_ZONE_ID],
    );
    return orgId;
  }

  it('incident.created (critical, with org) -> enqueues to admin_org of the org (reporter never receives)', async () => {
    const deliverSpy = jest.spyOn(mailService, 'deliver');

    const orgId = await seedOrgInZone();
    const reporter: ProvisionedUser = await env.provisionUser(['CREATE incidents'], {
      email: 'reporter-critical-e2e@example.com',
      organizationId: orgId,
    });
    const adminOrg: ProvisionedUser = await env.provisionUser(['READ incidents'], {
      email: 'admin-org-e2e@example.com',
      organizationId: orgId,
      roleName: 'admin_org',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Accidente crítico',
        description: 'Vehículo volcado',
        priority: 'critical',
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);

    // Sanity: the geofence resolved the org correctly inside
    // `create()`. If this is null, the stream entry will also have
    // null organization_id and the listener will return early —
    // the waitUntil below is a clear signal.
    expect(created.body.zone_id).toBe(SANTA_ELENA_ZONE_ID);
    expect(created.body.organization_id).toBe(orgId);

    await waitUntil(
      async () =>
        deliverSpy.mock.calls.some(
          (call) =>
            call[0] === 'admin-org-e2e@example.com' && call[2] === 'incident.created',
        ),
      20_000,
    );

    expect(deliverSpy).toHaveBeenCalledWith(
      'admin-org-e2e@example.com',
      expect.stringContaining('Critical incident reported: Accidente crítico'),
      'incident.created',
      expect.objectContaining({ title: 'Accidente crítico' }),
    );

    // The reporter NEVER receives a copy — verify the negative
    // outright so a regression that re-adds the "acuse" is caught
    // here instead of silently passing.
    expect(
      deliverSpy.mock.calls.some(
        (call) => call[0] === 'reporter-critical-e2e@example.com',
      ),
    ).toBe(false);

    // Silence the unused-adminOrg warning while keeping the
    // provisioning legible to a reader.
    expect(adminOrg.userId).toBeDefined();
  });

  /**
   * Companion to the case above — a non-critical incident does not
   * trigger any mail on creation (low/medium/high stay silent).
   * Guards against the listener accidentally firing on every
   * publication again.
   */
  it('incident.created (priority != critical) -> NO mail enqueued (reporter no recibe, nadie recibe)', async () => {
    const deliverSpy = jest.spyOn(mailService, 'deliver');

    const orgId = await seedOrgInZone();
    const reporter: ProvisionedUser = await env.provisionUser(['CREATE incidents'], {
      email: 'reporter-noncritical-e2e@example.com',
      organizationId: orgId,
    });
    await env.provisionUser(['READ incidents'], {
      email: 'admin-org-noncritical@example.com',
      organizationId: orgId,
      roleName: 'admin_org',
    });

    await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Bache leve',
        description: 'Calle secundaria',
        priority: 'high',
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);

    // Give the listener a chance to mistakenly enqueue. If it
    // didn't fire within the budget, it didn't fire at all — the
    // listener is single-pass per event and there's nothing more
    // to do.
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    expect(deliverSpy).not.toHaveBeenCalled();
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

    // Wait for the entry to be ack'd (sweep may still be running)
    await waitUntil(async () => (await pendingCount()) === 0, 10_000);
    expect(await pendingCount()).toBe(0);
  }, 45_000);
});
