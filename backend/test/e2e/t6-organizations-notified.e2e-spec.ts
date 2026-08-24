import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

/**
 * T6.1.B6 — GET /organizations/notified-for dual input + is_claimable.
 *  (a) ?location_id={zone_uuid} returns orgs with is_claimable
 *  (b) ?lat=-2.2&lng=-80.5 still works
 *  (c) no params → 400
 */
describe('E2E T6 organizations notified-for (T6.1.B6)', () => {
  let env: TestEnvironment;

  const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';
  const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    // Remove any org that might be tied to the Santa Elena zone from a previous
    // test, so the UNIQUE partial index on zone_id doesn't block our insert.
    await env.pg.query(
      `DELETE FROM organizations WHERE zone_id = $1`,
      [SANTA_ELENA_ZONE_ID],
    );
  });

  it('T6.1.B6a: ?location_id={zone_uuid} returns orgs with is_claimable field', async () => {
    const user = await env.provisionUser([]);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const orgId = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id, max_active_claims)
       VALUES ($1, 'Test Org Santa Elena', $2, 5)`,
      [orgId, SANTA_ELENA_ZONE_ID],
    );

    const res = await request(env.httpServer)
      .get(`/api/organizations/notified-for?location_id=${SANTA_ELENA_ZONE_ID}`)
      .set(auth)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const org = (res.body as Array<{ id: string; is_claimable: boolean }>).find(
      (o) => o.id === orgId,
    );
    expect(org).toBeDefined();
    expect(org!.is_claimable).toBe(true);
  });

  it('T6.1.B6b: ?lat=-2.2&lng=-80.5 still returns orgs via geofencing', async () => {
    const user = await env.provisionUser([]);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const orgId = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id, max_active_claims)
       VALUES ($1, 'Test Org Latlong', $2, 5)`,
      [orgId, SANTA_ELENA_ZONE_ID],
    );

    const res = await request(env.httpServer)
      .get(`/api/organizations/notified-for?lat=${INSIDE_SANTA_ELENA.lat}&lng=${INSIDE_SANTA_ELENA.lng}`)
      .set(auth)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const ids = (res.body as Array<{ id: string }>).map((o) => o.id);
    expect(ids).toContain(orgId);
  });

  it('T6.1.B6c: no params → 400', async () => {
    const user = await env.provisionUser([]);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    await request(env.httpServer)
      .get('/api/organizations/notified-for')
      .set(auth)
      .expect(400);
  });
});
