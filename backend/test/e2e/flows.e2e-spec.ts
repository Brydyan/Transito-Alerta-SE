import request from 'supertest';

import { INCIDENTS_STREAM_KEY } from '../../src/modules/incidents/incidents.service';
import { decodeStreamEntry } from '../../src/modules/realtime/stream-event.util';
import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * Real workflow flows (T4.1a step 2, Part B) — the follow-up promised in the
 * harness smoke test (T4.1a). Real HTTP, real Postgres, real Redis.
 * Operators hold permissions the anonymous ceiling lacks; every one of them
 * is provisioned via the harness's `provisionUser()` against this test's own
 * throwaway database, never a shared or developer database.
 */
describe('E2E flows (T4.1a step 2, Part B)', () => {
  let env: TestEnvironment;

  const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';
  const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };
  const OUTSIDE_ALL_ZONES = { lat: 10.0, lng: -70.0 };

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  function authHeader(user: ProvisionedUser): { Authorization: string } {
    return { Authorization: `Bearer ${user.accessToken}` };
  }

  it('anonymous emergency report: inside Santa Elena, outside all zones (still accepted per R2), then read back', async () => {
    const login = await request(env.httpServer)
      .post('/api/auth/login')
      .send({ device_uuid: 'anonymous' })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.access_token}` };

    const inside = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Choque en via principal', description: 'Dos vehiculos', ...INSIDE_SANTA_ELENA })
      .expect(201);
    expect(inside.body.zone_id).toBe(SANTA_ELENA_ZONE_ID);
    expect(inside.body.geofence_matched).toBe(true);

    // R2: a report outside every defined boundary must NOT be rejected —
    // losing an emergency report is worse than filing it out of zone.
    const outside = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Fuera de jurisdiccion', ...OUTSIDE_ALL_ZONES })
      .expect(201);
    expect(outside.body.zone_id).toBeNull();
    expect(outside.body.geofence_matched).toBe(false);

    const readBack = await request(env.httpServer)
      .get(`/api/incidents/${inside.body.id}`)
      .set(auth)
      .expect(200);
    expect(readBack.body.id).toBe(inside.body.id);
    expect(readBack.body.title).toBe('Choque en via principal');
  });

  it('anonymous ceiling (CC2): READ/CREATE succeed; UPDATE/DELETE/ASSIGN refused 403; unauthenticated refused 401', async () => {
    const login = await request(env.httpServer)
      .post('/api/auth/login')
      .send({ device_uuid: 'anonymous' })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.access_token}` };

    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
      .expect(201);
    await request(env.httpServer).get('/api/incidents').set(auth).expect(200);

    const comment = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incident.body.id, content: 'Yo pase por ahi' })
      .expect(201);
    await request(env.httpServer)
      .get(`/api/comments/incident/${incident.body.id}`)
      .set(auth)
      .expect(200);

    // Not even over its own rows — the ceiling grants READ/CREATE only.
    await request(env.httpServer)
      .patch(`/api/incidents/${incident.body.id}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(403);
    await request(env.httpServer).delete(`/api/comments/${comment.body.id}`).set(auth).expect(403);
    await request(env.httpServer)
      .post('/api/assignments')
      .set(auth)
      .send({ incident_id: incident.body.id, operator_id: incident.body.citizen_id })
      .expect(403);

    await request(env.httpServer).get('/api/incidents').expect(401);
  });

  it('assignment: an operator claims an incident, a second claim conflicts, the event reaches incidents:events', async () => {
    const operator = await env.provisionUser(['CREATE incidents', 'READ incidents', 'ASSIGN assignments']);
    const secondOperator = await env.provisionUser(['ASSIGN assignments']);

    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set(authHeader(operator))
      .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
      .expect(201);

    await request(env.httpServer)
      .post('/api/assignments')
      .set(authHeader(operator))
      .send({ incident_id: incident.body.id, operator_id: operator.userId })
      .expect(201);

    await request(env.httpServer)
      .post('/api/assignments')
      .set(authHeader(secondOperator))
      .send({ incident_id: incident.body.id, operator_id: secondOperator.userId })
      .expect(409);

    const entries = await env.redisStreams.xrevrange(INCIDENTS_STREAM_KEY, '+', '-', 'COUNT', 10);
    const assignedEvent = entries
      .map(([, fields]) => decodeStreamEntry(fields))
      .find((event) => event?.type === 'incident.assigned');
    expect(assignedEvent).toBeDefined();
    expect(assignedEvent?.data).toMatchObject({ incidentId: incident.body.id, operatorId: operator.userId });
  });

  it('comment lifecycle: a <script> payload is sanitized in the PERSISTED row, owner deletes, non-owner refused', async () => {
    const author = await env.provisionUser([
      'CREATE incidents',
      'READ incidents',
      'CREATE comments',
      'DELETE comments',
    ]);
    const stranger = await env.provisionUser(['DELETE comments']);

    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set(authHeader(author))
      .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
      .expect(201);

    const maliciousContent = '<script>alert(1)</script>Sigue bloqueado';
    const comment = await request(env.httpServer)
      .post('/api/comments')
      .set(authHeader(author))
      .send({ incident_id: incident.body.id, content: maliciousContent })
      .expect(201);
    expect(comment.body.content).not.toContain('<script>');

    // Not just the response — the row TypeORM actually wrote to Postgres.
    const { rows } = await env.pg.query<{ content: string }>('SELECT content FROM comments WHERE id = $1', [
      comment.body.id,
    ]);
    expect(rows[0].content).not.toContain('<script>');
    expect(rows[0].content).not.toContain('<');
    expect(rows[0].content).toContain('Sigue bloqueado');

    await request(env.httpServer)
      .delete(`/api/comments/${comment.body.id}`)
      .set(authHeader(stranger))
      .expect(403);

    await request(env.httpServer)
      .delete(`/api/comments/${comment.body.id}`)
      .set(authHeader(author))
      .expect(204);
  });

  it('status lifecycle: pending -> in_progress -> resolved; an out-of-order transition is refused; each transition purges cached listings and emits to the stream', async () => {
    const operator = await env.provisionUser(['CREATE incidents', 'READ incidents', 'UPDATE incidents']);
    const auth = authHeader(operator);

    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Choque en via principal', ...INSIDE_SANTA_ELENA })
      .expect(201);
    expect(incident.body.status).toBe('pending');

    // Out-of-order: pending -> resolved skips in_progress.
    // 409, no 400: sc-315 declaró la máquina de estados y el spec consolidado
    // lo fija — «all undeclared transitions MUST be rejected with 409» y «No
    // state skipping … THEN 409» (openspec/specs/incident-workflow/spec.md:30,37).
    // Una transición ilegal no es una petición malformada: es un conflicto con
    // el estado actual del recurso.
    await request(env.httpServer)
      .patch(`/api/incidents/${incident.body.id}/status`)
      .set(auth)
      .send({ status: 'resolved' })
      .expect(409);

    // Populate a status-filtered listing cache BEFORE the legal transition,
    // so the purge assertion below proves the write actually reached it —
    // the old by-name invalidation never did (regression 7284831).
    await request(env.httpServer)
      .get('/api/incidents')
      .query({ zone_id: SANTA_ELENA_ZONE_ID, status: 'pending' })
      .set(auth)
      .expect(200);
    // T3.2 — list cache key now carries a scope discriminator (design
    // "Scope-blind list cache" risk mitigation); this operator has no
    // seeded role (role_id IS NULL, D2) -> `public` scope -> `:p`.
    const pendingListKey = `incidents:list:${SANTA_ELENA_ZONE_ID}:pending:p`;
    expect(await env.redisCache.get(pendingListKey)).not.toBeNull();

    await request(env.httpServer)
      .patch(`/api/incidents/${incident.body.id}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(200);
    expect(await env.redisCache.get(pendingListKey)).toBeNull();

    await request(env.httpServer)
      .get('/api/incidents')
      .query({ zone_id: SANTA_ELENA_ZONE_ID, status: 'in_progress' })
      .set(auth)
      .expect(200);
    const inProgressListKey = `incidents:list:${SANTA_ELENA_ZONE_ID}:in_progress:p`;
    expect(await env.redisCache.get(inProgressListKey)).not.toBeNull();

    const resolved = await request(env.httpServer)
      .patch(`/api/incidents/${incident.body.id}/status`)
      .set(auth)
      .send({ status: 'resolved' })
      .expect(200);
    expect(resolved.body.status).toBe('resolved');
    expect(await env.redisCache.get(inProgressListKey)).toBeNull();

    // resolved is terminal — nothing legally follows it.
    await request(env.httpServer)
      .patch(`/api/incidents/${incident.body.id}/status`)
      .set(auth)
      .send({ status: 'in_progress' })
      .expect(400);

    const entries = await env.redisStreams.xrevrange(INCIDENTS_STREAM_KEY, '+', '-', 'COUNT', 10);
    const statusChangedCount = entries
      .map(([, fields]) => decodeStreamEntry(fields))
      .filter((event) => event?.type === 'incident.status_changed').length;
    expect(statusChangedCount).toBe(2);
  });
});
