import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

/**
 * T6.3 e2e — incident metrics columns (claimed_at, resolution_date).
 *  - T6.3.D1: POST /incidents/:id/claim → claimed_at IS NOT NULL
 *  - T6.3.D2: status → resolved → resolution_date IS NOT NULL;
 *             status → in_progress → resolution_date IS NULL (reject/not-resolved flow)
 */
describe('E2E T6 incident metrics (T6.3.D1, T6.3.D2)', () => {
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
    orgId = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name) VALUES ($1, $2)`,
      [orgId, `Org ${orgId.slice(0, 8)}`],
    );
  });

  // ---- T6.3.D1 — claimed_at after claim ------------------------------------

  it('T6.3.D1: POST /incidents/:id/claim → GET incident → claimed_at IS NOT NULL', async () => {
    const operator = await env.provisionUser(
      ['CREATE incidents', 'CLAIM incidents', 'READ incidents'],
      { organizationId: orgId, roleName: 'operador_organizacion' },
    );
    const auth = { Authorization: `Bearer ${operator.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Claimable incident', ...INSIDE_SANTA_ELENA })
      .expect(201);

    const incidentId = created.body.id as string;
    await env.pg.query('UPDATE incidents SET organization_id = $1 WHERE id = $2', [orgId, incidentId]);

    await request(env.httpServer)
      .post(`/api/incidents/${incidentId}/claim`)
      .set(auth)
      .expect(200);

    // Check via DB directly — claimed_at must be set
    const { rows } = await env.pg.query<{ claimed_at: Date | null }>(
      `SELECT claimed_at FROM incidents WHERE id = $1`,
      [incidentId],
    );
    expect(rows[0].claimed_at).not.toBeNull();
  });

  // ---- T6.3.D2 — resolution_date after status change -----------------------

  it('T6.3.D2: status → in_progress → resolution_date IS NULL', async () => {
    // Use a system operator with global scope so they can see and update any incident.
    const sysOp = await env.provisionUser(['CREATE incidents', 'READ incidents', 'UPDATE incidents'], {
      roleName: 'operador_sistema',
    });
    const auth = { Authorization: `Bearer ${sysOp.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Resolution check', ...INSIDE_SANTA_ELENA })
      .expect(201);

    const incidentId = created.body.id as string;

    // pending → in_progress
    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(200);

    const { rows } = await env.pg.query<{ resolution_date: Date | null }>(
      `SELECT resolution_date FROM incidents WHERE id = $1`,
      [incidentId],
    );
    expect(rows[0].resolution_date).toBeNull();
  });

  it('T6.3.D2: status → resolved → resolution_date IS NOT NULL', async () => {
    const sysOp = await env.provisionUser(['CREATE incidents', 'READ incidents', 'UPDATE incidents'], {
      roleName: 'operador_sistema',
    });
    const auth = { Authorization: `Bearer ${sysOp.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Resolve me', ...INSIDE_SANTA_ELENA })
      .expect(201);

    const incidentId = created.body.id as string;

    // pending → in_progress
    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(200);

    // in_progress → resolved
    const resolved = await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'resolved' })
      .expect(200);

    // Check via response body (claimed_at/resolution_date are in SELECT_COLUMNS)
    expect(resolved.body.resolution_date).not.toBeNull();

    // Double-check via DB
    const { rows } = await env.pg.query<{ resolution_date: Date | null }>(
      `SELECT resolution_date FROM incidents WHERE id = $1`,
      [incidentId],
    );
    expect(rows[0].resolution_date).not.toBeNull();
  });
});
