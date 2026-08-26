import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

/** Insert a minimal incident row directly into Postgres. */
async function seedIncident(
  env: TestEnvironment,
  opts: {
    citizenId: string;
    organizationId?: string | null;
    status?: string;
    priority?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await env.pg.query(
    `INSERT INTO incidents (id, title, location, status, priority, citizen_id, organization_id)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint(-80.5, -2.2), 4326), $3, $4, $5, $6)`,
    [
      id,
      `Test incident ${id.slice(0, 8)}`,
      opts.status ?? 'pending',
      opts.priority ?? 'medium',
      opts.citizenId,
      opts.organizationId ?? null,
    ],
  );
  return id;
}

describe('E2E incident analytics (T5.2)', () => {
  let env: TestEnvironment;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    orgA = randomUUID();
    orgB = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name) VALUES ($1, $2), ($3, $4)`,
      [orgA, `org-a-${orgA.slice(0, 8)}`, orgB, `org-b-${orgB.slice(0, 8)}`],
    );
  });

  // ---- GET /api/incidents/stats ---------------------------------------------

  it('stats: unauthenticated → 401', async () => {
    await request(env.httpServer).get('/api/incidents/stats').expect(401);
  });

  it('stats: citizen (no READ dashboard permission) → 403', async () => {
    const citizen = await env.provisionUser(['READ incidents']);
    await request(env.httpServer)
      .get('/api/incidents/stats')
      .set('Authorization', `Bearer ${citizen.accessToken}`)
      .expect(403);
  });

  it('stats: system admin sees total across both orgs', async () => {
    const citizen = await env.provisionUser([]);
    const sysAdmin = await env.provisionUser(['READ dashboard'], { roleName: 'master' });

    await seedIncident(env, { citizenId: citizen.userId, organizationId: orgA });
    await seedIncident(env, { citizenId: citizen.userId, organizationId: orgB });

    const res = await request(env.httpServer)
      .get('/api/incidents/stats')
      .set('Authorization', `Bearer ${sysAdmin.accessToken}`)
      .expect(200);

    const body = res.body as { total: number };
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it('stats: org admin sees only own org incidents', async () => {
    const citizen = await env.provisionUser([]);
    const orgAdmin = await env.provisionUser(['READ dashboard'], {
      roleName: 'admin_org',
      organizationId: orgA,
    });

    await seedIncident(env, { citizenId: citizen.userId, organizationId: orgA });
    await seedIncident(env, { citizenId: citizen.userId, organizationId: orgA });
    await seedIncident(env, { citizenId: citizen.userId, organizationId: orgB });

    const res = await request(env.httpServer)
      .get('/api/incidents/stats')
      .set('Authorization', `Bearer ${orgAdmin.accessToken}`)
      .expect(200);

    const body = res.body as { total: number };
    expect(body.total).toBe(2);
  });

  it('stats: response has expected shape (by_status, by_priority, top_categories, trends)', async () => {
    const citizen = await env.provisionUser([]);
    const sysAdmin = await env.provisionUser(['READ dashboard'], { roleName: 'master' });

    await seedIncident(env, { citizenId: citizen.userId, status: 'pending', priority: 'high' });

    const res = await request(env.httpServer)
      .get('/api/incidents/stats')
      .set('Authorization', `Bearer ${sysAdmin.accessToken}`)
      .expect(200);

    const body = res.body as {
      total: number;
      by_status: Record<string, number>;
      by_priority: Record<string, number>;
      trends: { total_pct: number | null };
      top_categories: unknown[];
    };
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('by_status');
    expect(body).toHaveProperty('by_priority');
    expect(body).toHaveProperty('trends');
    expect(body).toHaveProperty('top_categories');
    // Zero-fill: all statuses present
    expect(body.by_status).toHaveProperty('pending');
    expect(body.by_status).toHaveProperty('in_progress');
    expect(body.by_status).toHaveProperty('resolved');
    // Zero-fill: all priorities present
    expect(body.by_priority).toHaveProperty('low');
    expect(body.by_priority).toHaveProperty('medium');
    expect(body.by_priority).toHaveProperty('high');
    expect(body.by_priority).toHaveProperty('critical');
  });

  // ---- GET /api/incidents/weekly-stats -------------------------------------

  it('weekly-stats: unauthenticated → 401', async () => {
    await request(env.httpServer).get('/api/incidents/weekly-stats').expect(401);
  });

  it('weekly-stats: default window → 10 days array', async () => {
    const sysAdmin = await env.provisionUser(['READ dashboard'], { roleName: 'master' });

    const res = await request(env.httpServer)
      .get('/api/incidents/weekly-stats')
      .set('Authorization', `Bearer ${sysAdmin.accessToken}`)
      .expect(200);

    const body = res.body as { days: { date: string; label: string; recibidas: number; resueltas: number }[] };
    expect(body.days).toHaveLength(10);
    // Each day has required fields
    const day = body.days[0];
    expect(day).toHaveProperty('date');
    expect(day).toHaveProperty('label');
    expect(day).toHaveProperty('recibidas');
    expect(day).toHaveProperty('resueltas');
  });

  it('weekly-stats: fin < inicio → 422', async () => {
    const sysAdmin = await env.provisionUser(['READ dashboard'], { roleName: 'master' });

    await request(env.httpServer)
      .get('/api/incidents/weekly-stats')
      .query({ inicio: '2026-08-10', fin: '2026-08-01' })
      .set('Authorization', `Bearer ${sysAdmin.accessToken}`)
      .expect(422);
  });

  // ---- GET /api/incidents/feed ---------------------------------------------

  it('feed: unauthenticated → 401', async () => {
    await request(env.httpServer).get('/api/incidents/feed').expect(401);
  });

  it('feed: org operator sees org-scoped incidents', async () => {
    const citizen = await env.provisionUser([]);
    const operator = await env.provisionUser(['READ incidents'], {
      roleName: 'operador_org',
      organizationId: orgA,
    });

    await seedIncident(env, { citizenId: citizen.userId, organizationId: orgA });
    await seedIncident(env, { citizenId: citizen.userId, organizationId: orgB });

    const res = await request(env.httpServer)
      .get('/api/incidents/feed')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);

    const body = res.body as { data: { organization_id: string }[]; meta: { total: number } };
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('meta');
    // All returned incidents belong to orgA
    for (const item of body.data) {
      expect(item.organization_id).toBe(orgA);
    }
    // Should not see orgB incident
    expect(body.meta.total).toBe(1);
  });

  it('feed: citizen gets incidents via Postgres fallback when cache empty', async () => {
    const citizen = await env.provisionUser(['READ incidents']);
    // env.reset() already flushed cache DB — Redis key absent → Postgres fallback
    await seedIncident(env, { citizenId: citizen.userId });

    const res = await request(env.httpServer)
      .get('/api/incidents/feed')
      .set('Authorization', `Bearer ${citizen.accessToken}`)
      .expect(200);

    const body = res.body as { data: { title: string }[]; meta: { total: number } };
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('meta');
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
  });

  // ---- GET /api/incidents/export -------------------------------------------

  it('export: unauthenticated → 401', async () => {
    await request(env.httpServer).get('/api/incidents/export').expect(401);
  });

  it('export: citizen (no READ dashboard) → 403', async () => {
    const citizen = await env.provisionUser(['READ incidents']);
    await request(env.httpServer)
      .get('/api/incidents/export')
      .set('Authorization', `Bearer ${citizen.accessToken}`)
      .expect(403);
  });

  it('export: returns CSV with correct header and content-type', async () => {
    const citizen = await env.provisionUser([]);
    const sysAdmin = await env.provisionUser(['READ dashboard'], { roleName: 'master' });

    await seedIncident(env, { citizenId: citizen.userId });

    const res = await request(env.httpServer)
      .get('/api/incidents/export')
      .set('Authorization', `Bearer ${sysAdmin.accessToken}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.csv');
    const text = res.text;
    const headerLine = text.split('\n')[0];
    expect(headerLine).toBe('id,title,status,priority,organization,category,created_at,resolution_date');
  });
});
