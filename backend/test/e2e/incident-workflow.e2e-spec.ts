import { randomUUID } from 'crypto';
import request from 'supertest';

import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

/**
 * T5.1 — operator claim/release workflow at the real HTTP seam.
 * Each test provisions its own org (because `reset()` only TRUNCATEs
 * non-fixture tables — organizations is left alone by reset() but recreated
 * per test from the migrations; still, we use fresh UUIDs to avoid coupling).
 */
describe('E2E incident workflow — claim/release/operators/statuses (T5.1)', () => {
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
      'INSERT INTO organizations (id, name) VALUES ($1, $2), ($3, $4)',
      [orgA, `Org A ${orgA.slice(0, 8)}`, orgB, `Org B ${orgB.slice(0, 8)}`],
    );
  });

  // ---- happy path --------------------------------------------------------

  it('operator claims an unclaimed incident, then releases it', async () => {
    const operator = await env.provisionUser(['CREATE incidents', 'CLAIM incidents', 'RELEASE incidents'], {
      organizationId: orgA,
      roleName: 'operador_org',
    });
    const auth = { Authorization: `Bearer ${operator.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
      .expect(201);

    // Override organization_id: 0015's geofence backfill sets it from the
    // zone, but in this harness the zone has no org (no organizations row
    // matches that zone_id at seed time). So we patch the incident directly.
    await env.pg.query('UPDATE incidents SET organization_id = $1 WHERE id = $2', [orgA, created.body.id]);

    const claim = await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/claim`)
      .set(auth)
      .expect(200);
    expect(claim.body.claimed_by).toBe(operator.userId);

    const release = await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/release`)
      .set(auth)
      .expect(200);
    expect(release.body.claimed_by).toBeNull();
  });

  // ---- 409 conflict ------------------------------------------------------

  it('second operator claim on the same incident returns 409', async () => {
    const op1 = await env.provisionUser(['CREATE incidents', 'CLAIM incidents'], {
      organizationId: orgA,
      roleName: 'operador_org',
    });
    const op2 = await env.provisionUser(['CLAIM incidents'], {
      organizationId: orgA,
      roleName: 'operador_org',
    });
    const a1 = { Authorization: `Bearer ${op1.accessToken}` };
    const a2 = { Authorization: `Bearer ${op2.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(a1)
      .send({ title: 'Inc A', ...INSIDE_SANTA_ELENA })
      .expect(201);
    await env.pg.query('UPDATE incidents SET organization_id = $1 WHERE id = $2', [orgA, created.body.id]);

    await request(env.httpServer).post(`/api/incidents/${created.body.id}/claim`).set(a1).expect(200);

    const conflict = await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/claim`)
      .set(a2)
      .expect(409);
    expect(JSON.stringify(conflict.body)).toMatch(/INCIDENT_ALREADY_CLAIMED/);
  });

  // ---- 403 wrong org -----------------------------------------------------

  it('operator from a different org gets 403 on claim', async () => {
    const op = await env.provisionUser(['CREATE incidents', 'CLAIM incidents'], {
      organizationId: orgB,
      roleName: 'operador_org',
    });

    // Create incident from a same-org creator and pin orgA on it.
    const creator = await env.provisionUser(['CREATE incidents'], {
      organizationId: orgA,
      roleName: 'operador_org',
    });
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ title: 'Outsider cannot claim', ...INSIDE_SANTA_ELENA })
      .expect(201);
    await env.pg.query('UPDATE incidents SET organization_id = $1 WHERE id = $2', [orgA, created.body.id]);

    const response = await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/claim`)
      .set('Authorization', `Bearer ${op.accessToken}`)
      .expect(403);
    expect(JSON.stringify(response.body)).toMatch(/WRONG_ORGANIZATION/);
  });

  // ---- 403 not-the-claimer on release -----------------------------------

  it('non-claimer gets 403 on release', async () => {
    const op1 = await env.provisionUser(['CREATE incidents', 'CLAIM incidents', 'RELEASE incidents'], {
      organizationId: orgA,
      roleName: 'operador_org',
    });
    const op2 = await env.provisionUser(['RELEASE incidents'], {
      organizationId: orgA,
      roleName: 'operador_org',
    });
    const a1 = { Authorization: `Bearer ${op1.accessToken}` };
    const a2 = { Authorization: `Bearer ${op2.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(a1)
      .send({ title: 'Only claimer can release', ...INSIDE_SANTA_ELENA })
      .expect(201);
    await env.pg.query('UPDATE incidents SET organization_id = $1 WHERE id = $2', [orgA, created.body.id]);
    await request(env.httpServer).post(`/api/incidents/${created.body.id}/claim`).set(a1).expect(200);

    const response = await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/release`)
      .set(a2)
      .expect(403);
    expect(JSON.stringify(response.body)).toMatch(/NOT_THE_CLAIMER/);
  });

  // ---- status catalog ---------------------------------------------------

  it('GET /api/incidents/statuses returns the incident status values for any authenticated user', async () => {
    const anyUser: ProvisionedUser = await env.provisionUser(['READ incidents']);

    const response = await request(env.httpServer)
      .get('/api/incidents/statuses')
      .set('Authorization', `Bearer ${anyUser.accessToken}`)
      .expect(200);

    // T6.8.A4 — getStatuses() returns [{ id, label }] array (updated from original wrapper shape)
    expect(Array.isArray(response.body)).toBe(true);
    const ids = (response.body as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain('pending');
    expect(ids).toContain('in_progress');
    expect(ids).toContain('resolved');
  });

  it('GET /api/incidents/statuses without auth returns 401', async () => {
    await request(env.httpServer).get('/api/incidents/statuses').expect(401);
  });

  // ---- available-operators ----------------------------------------------

  it('available-operators returns operators under the cap in the same org', async () => {
    const op1 = await env.provisionUser(['CREATE incidents', 'READ incidents'], {
      organizationId: orgA,
      roleName: 'operador_org',
    });
    const op2 = await env.provisionUser(['READ incidents'], {
      organizationId: orgA,
      roleName: 'operador_org',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${op1.accessToken}`)
      .send({ title: 'Two ops, both eligible', ...INSIDE_SANTA_ELENA })
      .expect(201);
    await env.pg.query('UPDATE incidents SET organization_id = $1 WHERE id = $2', [orgA, created.body.id]);

    const response = await request(env.httpServer)
      .get(`/api/incidents/${created.body.id}/available-operators`)
      .set('Authorization', `Bearer ${op1.accessToken}`)
      .expect(200);

    const ids = (response.body as Array<{ id: string }>).map((o) => o.id);
    expect(ids).toContain(op1.userId);
    expect(ids).toContain(op2.userId);
  });

  // ---- 401 unauthenticated ----------------------------------------------

  it('unauthenticated claim returns 401', async () => {
    const creator = await env.provisionUser(['CREATE incidents'], {
      organizationId: orgA,
      roleName: 'operador_org',
    });
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ title: 'No auth claim', ...INSIDE_SANTA_ELENA })
      .expect(201);
    await env.pg.query('UPDATE incidents SET organization_id = $1 WHERE id = $2', [orgA, created.body.id]);

    await request(env.httpServer).post(`/api/incidents/${created.body.id}/claim`).expect(401);
  });
});
