import { randomUUID } from 'crypto';

import request from 'supertest';

import { INCIDENTS_STREAM_KEY } from '../../src/modules/incidents/incidents.service';
import { decodeStreamEntry } from '../../src/modules/realtime/stream-event.util';
import { StatusHistoryRepository } from '../../src/modules/status-history/status-history.repository';
import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

const STATUS_HISTORY_CONSUMER_GROUP = 'status-history';

// Copied, not promoted to test/support/ (design "Testing Strategy" — T3.4
// is not the place for a shared-helper refactor). Bounded poll, never a
// fixed sleep — the listener consumes the stream asynchronously (spec
// "Eventual Consistency").
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
 * StatusHistory module e2e (T3.4). Real Postgres, real Redis
 * (Testcontainers), the real running app — proves the listener actually
 * consumes `incidents:events` under its own consumer group and that the
 * read route enforces the explicit permission override (D1).
 */
describe('StatusHistory module e2e (T3.4)', () => {
  let env: TestEnvironment;

  const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();

    // This suite registers a THIRD consumer group on incidents:events.
    // XTRIM clears entries while preserving the stream key and every
    // registered consumer group — never XGROUP DESTROY/CREATE, which
    // races the live status-history/mail/realtime loops parked in
    // XREADGROUP ... BLOCK (see test-environment.ts and design
    // "Flake hardening").
    await env.redisStreams.xtrim(INCIDENTS_STREAM_KEY, 'MAXLEN', '~', '0');

    // xtrim does not clear PELs — best-effort drain so a prior test's
    // unacked entry cannot get swept mid-next-test and insert a row the
    // current test did not create.
    try {
      const pending = (await env.redisStreams.xpending(
        INCIDENTS_STREAM_KEY,
        STATUS_HISTORY_CONSUMER_GROUP,
        '-',
        '+',
        100,
      )) as unknown as [string, string, number, number][];
      for (const [entryId] of pending) {
        await env.redisStreams.xack(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, entryId).catch(() => undefined);
      }
    } catch {
      // Group may not exist yet on the very first test — expected.
    }
  });

  function authHeader(user: ProvisionedUser): { Authorization: string } {
    return { Authorization: `Bearer ${user.accessToken}` };
  }

  async function createIncident(auth: { Authorization: string }): Promise<string> {
    const res = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
      .expect(201);
    return res.body.id as string;
  }

  async function historyCount(pg = env.pg, incidentId: string): Promise<number> {
    const { rows } = await pg.query('SELECT count(*)::int AS count FROM status_history WHERE incident_id = $1', [
      incidentId,
    ]);
    return rows[0].count;
  }

  // TS-1 / TS-2 -------------------------------------------------------------

  it('TS-1/TS-2: a full pending -> in_progress -> resolved lifecycle writes exactly 2 ordered rows', async () => {
    const operator = await env.provisionUser([
      'CREATE incidents',
      'READ incidents',
      'UPDATE incidents',
      'READ status-history',
    ]);
    const auth = authHeader(operator);
    const incidentId = await createIncident(auth);

    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(200);

    await waitUntil(async () => (await historyCount(env.pg, incidentId)) === 1);

    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'resolved' })
      .expect(200);

    await waitUntil(async () => (await historyCount(env.pg, incidentId)) === 2);

    const response = await request(env.httpServer)
      .get(`/api/incidents/${incidentId}/status-history`)
      .set(auth)
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toMatchObject({
      previous_status: 'pending',
      new_status: 'in_progress',
      changed_by_user_id: operator.userId,
    });
    expect(response.body.items[1]).toMatchObject({
      previous_status: 'in_progress',
      new_status: 'resolved',
      changed_by_user_id: operator.userId,
    });
  });

  // TS-3 ----------------------------------------------------------------------

  it('TS-3: creating an incident writes no row', async () => {
    const operator = await env.provisionUser(['CREATE incidents', 'READ incidents', 'READ status-history']);
    const auth = authHeader(operator);
    const incidentId = await createIncident(auth);

    // Bounded wait for "nothing happens" — give the listener a fair
    // window to (wrongly) write a row, then assert it didn't.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await historyCount(env.pg, incidentId)).toBe(0);
  });

  // TS-4 ----------------------------------------------------------------------

  it('TS-4: a rejected illegal transition writes no row', async () => {
    const operator = await env.provisionUser([
      'CREATE incidents',
      'READ incidents',
      'UPDATE incidents',
      'READ status-history',
    ]);
    const auth = authHeader(operator);
    const incidentId = await createIncident(auth);

    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'resolved' })
      .expect(400);

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await historyCount(env.pg, incidentId)).toBe(0);
  });

  // TS-8 / TS-9 / TS-13 -------------------------------------------------------

  it('TS-13: unauthenticated request returns 401', async () => {
    const operator = await env.provisionUser(['CREATE incidents', 'READ incidents']);
    const incidentId = await createIncident(authHeader(operator));

    await request(env.httpServer).get(`/api/incidents/${incidentId}/status-history`).expect(401);
  });

  it('TS-8: READ incidents alone is insufficient — 403 (security regression guard for D1)', async () => {
    const creator = await env.provisionUser(['CREATE incidents', 'READ incidents']);
    const incidentId = await createIncident(authHeader(creator));

    // Deliberately holds READ incidents — the whole point is that the
    // *inferred* resource would have let it through (proposal D1).
    const denied = await env.provisionUser(['READ incidents', 'UPDATE incidents']);

    await request(env.httpServer)
      .get(`/api/incidents/${incidentId}/status-history`)
      .set(authHeader(denied))
      .expect(403);
  });

  it('TS-9: an authorized caller (READ status-history) gets the trail', async () => {
    const operator = await env.provisionUser([
      'CREATE incidents',
      'READ incidents',
      'UPDATE incidents',
      'READ status-history',
    ]);
    const auth = authHeader(operator);
    const incidentId = await createIncident(auth);

    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(200);
    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'resolved' })
      .expect(200);

    await waitUntil(async () => (await historyCount(env.pg, incidentId)) === 2);

    const response = await request(env.httpServer)
      .get(`/api/incidents/${incidentId}/status-history`)
      .set(auth)
      .expect(200);

    expect(response.body).toMatchObject({ total: 2 });
    expect(response.body.items).toHaveLength(2);
  });

  // TS-10 / TS-12 ---------------------------------------------------------------

  it('TS-12: a non-existent incident returns 404', async () => {
    const operator = await env.provisionUser(['READ incidents', 'READ status-history']);

    await request(env.httpServer)
      .get('/api/incidents/00000000-0000-0000-0000-000000000000/status-history')
      .set(authHeader(operator))
      .expect(404);
  });

  // Post-verify security fix (cross-tenant leak, T3.2 D3/D11) --------------

  // Incidents for these two tests are inserted directly (organization_id
  // set explicitly), not via POST /incidents — geofence-derived org
  // assignment is orthogonal to what's under test here (org-scoped READ
  // isolation), mirroring organizations.e2e-spec.ts's insertIncidentForOrg.
  async function insertIncidentForOrg(orgId: string): Promise<string> {
    const citizen = await env.provisionUser(['CREATE incidents']);
    const rows = await env.pg.query<{ id: string }>(
      `INSERT INTO incidents (title, location, citizen_id, organization_id)
       VALUES ($1, ST_SetSRID(ST_Point(-80.5, -2.2), 4326), $2, $3)
       RETURNING id`,
      ['Org-scoped incident', citizen.userId, orgId],
    );
    return rows.rows[0].id;
  }

  it('org-scoped staff CANNOT read another organization\'s status history — 404, not 403', async () => {
    const orgAId = randomUUID();
    const orgBId = randomUUID();
    await env.pg.query('INSERT INTO organizations (id, name) VALUES ($1, $2), ($3, $4)', [
      orgAId,
      'Org A',
      orgBId,
      'Org B',
    ]);

    const incidentOrgBId = await insertIncidentForOrg(orgBId);

    const orgAStaff = await env.provisionUser(['READ status-history'], {
      organizationId: orgAId,
      roleName: 'admin_organizacion',
    });

    await request(env.httpServer)
      .get(`/api/incidents/${incidentOrgBId}/status-history`)
      .set(authHeader(orgAStaff))
      .expect(404);
  });

  it('org-scoped staff CAN read its own organization\'s status history', async () => {
    const orgAId = randomUUID();
    await env.pg.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [orgAId, 'Org A']);

    const incidentId = await insertIncidentForOrg(orgAId);
    const orgAStaff = await env.provisionUser(
      ['UPDATE incidents', 'READ status-history'],
      { organizationId: orgAId, roleName: 'admin_organizacion' },
    );
    const auth = authHeader(orgAStaff);

    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(200);

    await waitUntil(async () => (await historyCount(env.pg, incidentId)) === 1);

    const response = await request(env.httpServer)
      .get(`/api/incidents/${incidentId}/status-history`)
      .set(auth)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
  });

  it('TS-10: no route exists to modify or delete a status-history row', async () => {
    const operator = await env.provisionUser([
      'CREATE incidents',
      'READ incidents',
      'UPDATE incidents',
      'READ status-history',
    ]);
    const auth = authHeader(operator);
    const incidentId = await createIncident(auth);

    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status-history`)
      .set(auth)
      .send({})
      .expect(404);
    await request(env.httpServer).delete(`/api/incidents/${incidentId}/status-history`).set(auth).expect(404);
  });

  // TS-5 (idempotency) ----------------------------------------------------------

  it('TS-5: calling StatusHistoryRepository.insert() twice with the same event_id inserts only one row', async () => {
    const operator = await env.provisionUser(['CREATE incidents', 'READ incidents']);
    const incidentId = await createIncident(authHeader(operator));
    const repository = env.app.get(StatusHistoryRepository);

    const data = {
      incidentId,
      changedByUserId: operator.userId,
      previousStatus: 'pending',
      newStatus: 'in_progress',
      eventId: 'e2e-idempotency-test-entry-id',
    };

    const first = await repository.insert(data);
    const second = await repository.insert(data);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(await historyCount(env.pg, incidentId)).toBe(1);
  });

  // Regression --------------------------------------------------------------

  it('regression: incident.status_changed events still carry previous_status and reach the stream twice for a full lifecycle', async () => {
    const operator = await env.provisionUser([
      'CREATE incidents',
      'READ incidents',
      'UPDATE incidents',
    ]);
    const auth = authHeader(operator);
    const incidentId = await createIncident(auth);

    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(200);
    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(auth)
      .send({ status: 'resolved' })
      .expect(200);

    const entries = await env.redisStreams.xrevrange(INCIDENTS_STREAM_KEY, '+', '-', 'COUNT', 10);
    const statusChangedEvents = entries
      .map(([, fields]) => decodeStreamEntry(fields))
      .filter((event) => event?.type === 'incident.status_changed');
    expect(statusChangedEvents).toHaveLength(2);
    for (const event of statusChangedEvents) {
      expect(event?.data.previous_status).toBeDefined();
    }
  });
});
