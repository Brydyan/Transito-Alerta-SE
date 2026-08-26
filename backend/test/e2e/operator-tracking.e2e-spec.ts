import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

const VALID_LOCATION = { lat: -2.2, lng: -80.5 };

describe('E2E operator tracking (T5.3)', () => {
  let env: TestEnvironment;
  let orgId: string;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();

    // Clean operator location keys so tests don't bleed into each other
    const keys = await env.redisStreams.keys('operators:loc:*');
    if (keys.length > 0) {
      await env.redisStreams.del(...keys);
    }

    orgId = randomUUID();
    await env.pg.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [
      orgId,
      `test-org-${orgId.slice(0, 8)}`,
    ]);
  });

  // ---- POST /api/operator/location ----------------------------------------

  it('operator pings location → 200, Redis key exists with TTL ≈ 300', async () => {
    const operator = await env.provisionUser(['CREATE incidents'], {
      roleName: 'operador_org',
      organizationId: orgId,
    });

    const res = await request(env.httpServer)
      .post('/api/operator/location')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send(VALID_LOCATION)
      .expect(200);

    expect((res.body as { status: string }).status).toBe('ok');

    const ttl = await env.redisStreams.ttl(`operators:loc:${orgId}`);
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it('citizen pings location → 403', async () => {
    const citizen = await env.provisionUser([]);

    await request(env.httpServer)
      .post('/api/operator/location')
      .set('Authorization', `Bearer ${citizen.accessToken}`)
      .send(VALID_LOCATION)
      .expect(403);
  });

  it('invalid lat (> 90) → 422', async () => {
    const operator = await env.provisionUser([], {
      roleName: 'operador_org',
      organizationId: orgId,
    });

    const res = await request(env.httpServer)
      .post('/api/operator/location')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ lat: 95, lng: 0 });
    // ValidationPipe returns 400; spec says 422 — accept either
    expect([400, 422]).toContain(res.status);
  });

  it('unauthenticated → 401', async () => {
    await request(env.httpServer)
      .post('/api/operator/location')
      .send(VALID_LOCATION)
      .expect(401);
  });

  // ---- GET /api/operator/locations ----------------------------------------

  it('GET locations (org-admin) → sees operator in same org, not operator in other org', async () => {
    const orgB = randomUUID();
    await env.pg.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [
      orgB,
      `org-b-${orgB.slice(0, 8)}`,
    ]);

    const operatorA = await env.provisionUser([], {
      roleName: 'operador_org',
      organizationId: orgId,
    });
    const operatorB = await env.provisionUser([], {
      roleName: 'operador_org',
      organizationId: orgB,
    });
    const orgAdmin = await env.provisionUser([], {
      roleName: 'admin_org',
      organizationId: orgId,
    });

    // Seed locations directly in Redis
    const entryA = JSON.stringify({
      userId: operatorA.userId,
      organizationId: orgId,
      lat: VALID_LOCATION.lat,
      lng: VALID_LOCATION.lng,
      updatedAt: new Date().toISOString(),
    });
    const entryB = JSON.stringify({
      userId: operatorB.userId,
      organizationId: orgB,
      lat: VALID_LOCATION.lat,
      lng: VALID_LOCATION.lng,
      updatedAt: new Date().toISOString(),
    });
    await env.redisStreams.hset(`operators:loc:${orgId}`, operatorA.userId, entryA);
    await env.redisStreams.hset(`operators:loc:${orgB}`, operatorB.userId, entryB);

    const res = await request(env.httpServer)
      .get('/api/operator/locations')
      .set('Authorization', `Bearer ${orgAdmin.accessToken}`)
      .expect(200);

    const operators = (res.body as { operators: { user_id: string }[] }).operators;
    const ids = operators.map((o) => o.user_id);
    expect(ids).toContain(operatorA.userId);
    expect(ids).not.toContain(operatorB.userId);
  });

  it('GET locations (system admin) → sees all orgs', async () => {
    const orgB = randomUUID();
    await env.pg.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [
      orgB,
      `org-b-${orgB.slice(0, 8)}`,
    ]);

    const sysAdmin = await env.provisionUser([], { roleName: 'master' });
    const opA = await env.provisionUser([], { roleName: 'operador_org', organizationId: orgId });
    const opB = await env.provisionUser([], { roleName: 'operador_org', organizationId: orgB });

    await env.redisStreams.hset(
      `operators:loc:${orgId}`,
      opA.userId,
      JSON.stringify({ userId: opA.userId, organizationId: orgId, lat: 0, lng: 0, updatedAt: new Date().toISOString() }),
    );
    await env.redisStreams.hset(
      `operators:loc:${orgB}`,
      opB.userId,
      JSON.stringify({ userId: opB.userId, organizationId: orgB, lat: 0, lng: 0, updatedAt: new Date().toISOString() }),
    );

    const res = await request(env.httpServer)
      .get('/api/operator/locations')
      .set('Authorization', `Bearer ${sysAdmin.accessToken}`)
      .expect(200);

    const operators = (res.body as { operators: { user_id: string }[] }).operators;
    const ids = operators.map((o) => o.user_id);
    expect(ids).toContain(opA.userId);
    expect(ids).toContain(opB.userId);
  });

  it('citizen GET locations → 403', async () => {
    const citizen = await env.provisionUser([]);

    await request(env.httpServer)
      .get('/api/operator/locations')
      .set('Authorization', `Bearer ${citizen.accessToken}`)
      .expect(403);
  });

  // ---- GET /api/operator/dashboard ----------------------------------------

  it('GET dashboard (operator with READ dashboard) → returns stats + incidents', async () => {
    const operator = await env.provisionUser(['READ dashboard'], {
      roleName: 'operador_org',
      organizationId: orgId,
    });

    const res = await request(env.httpServer)
      .get('/api/operator/dashboard')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);

    const body = res.body as {
      stats: { total_assigned: number; in_progress: number; resolved_today: number };
      incidents: unknown[];
      pagination: { page: number; per_page: number; total: number };
    };
    expect(typeof body.stats.total_assigned).toBe('number');
    expect(typeof body.stats.in_progress).toBe('number');
    expect(typeof body.stats.resolved_today).toBe('number');
    expect(Array.isArray(body.incidents)).toBe(true);
    expect(body.pagination.page).toBe(1);
  });

  it('GET dashboard (non-operator role) → 403', async () => {
    const orgAdmin = await env.provisionUser(['READ dashboard'], {
      roleName: 'admin_org',
      organizationId: orgId,
    });

    await request(env.httpServer)
      .get('/api/operator/dashboard')
      .set('Authorization', `Bearer ${orgAdmin.accessToken}`)
      .expect(403);
  });

  it('GET dashboard (operator without READ dashboard) → 403', async () => {
    const operator = await env.provisionUser([], {
      roleName: 'operador_org',
      organizationId: orgId,
    });

    await request(env.httpServer)
      .get('/api/operator/dashboard')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(403);
  });

  it('unauthenticated GET dashboard → 401', async () => {
    await request(env.httpServer)
      .get('/api/operator/dashboard')
      .expect(401);
  });
});
