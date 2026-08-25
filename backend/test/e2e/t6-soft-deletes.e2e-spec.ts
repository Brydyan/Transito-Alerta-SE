import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

/**
 * T6 soft-delete e2e:
 *  - T6.2.D1: DELETE /incidents/:id → 204 + soft delete + GET → 404 + relations survive
 *  - T6.2.D2: DELETE /assignments/:id → 204 + soft delete + re-assign same pair → 201
 *  - T6.4.A5: PATCH /assignments/:id {role} + {operator_id} + no-permission → 403
 */
describe('E2E T6 soft deletes + assignment update (T6.2.D1, T6.2.D2, T6.4.A5)', () => {
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

  // ---- helpers ----------------------------------------------------------------

  async function seedIncident(ownerId: string, orgOverride: string | null = orgId): Promise<string> {
    const { rows } = await env.pg.query<{ id: string }>(
      `INSERT INTO incidents (title, location, citizen_id, organization_id)
       VALUES ($1, ST_SetSRID(ST_Point(-80.5, -2.2), 4326), $2, $3)
       RETURNING id`,
      ['Test incident', ownerId, orgOverride],
    );
    return rows[0].id;
  }

  async function seedAssignment(incidentId: string, operatorId: string): Promise<string> {
    const { rows } = await env.pg.query<{ id: string }>(
      `INSERT INTO assignments (incident_id, operator_id, role) VALUES ($1, $2, 'primary') RETURNING id`,
      [incidentId, operatorId],
    );
    return rows[0].id;
  }

  // ---- T6.2.D1 — incident soft delete ----------------------------------------

  it('T6.2.D1: DELETE /incidents/:id → 204 + DB row still has deleted_at set', async () => {
    const admin = await env.provisionUser(['CREATE incidents', 'DELETE incidents', 'READ incidents'], {
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    // Create via HTTP so the incident is fully wired
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Soft delete me', ...INSIDE_SANTA_ELENA })
      .expect(201);

    const incidentId = created.body.id as string;

    await request(env.httpServer)
      .delete(`/api/incidents/${incidentId}`)
      .set(auth)
      .expect(204);

    // Row must still exist in DB
    const { rows } = await env.pg.query(
      `SELECT deleted_at FROM incidents WHERE id = $1`,
      [incidentId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('T6.2.D1: GET /incidents/:id after soft delete → 404', async () => {
    const admin = await env.provisionUser(['CREATE incidents', 'DELETE incidents', 'READ incidents'], {
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Gone after delete', ...INSIDE_SANTA_ELENA })
      .expect(201);

    const incidentId = created.body.id as string;

    await request(env.httpServer)
      .delete(`/api/incidents/${incidentId}`)
      .set(auth)
      .expect(204);

    await request(env.httpServer)
      .get(`/api/incidents/${incidentId}`)
      .set(auth)
      .expect(404);
  });

  it('T6.2.D1: status_history and assignment rows survive soft delete', async () => {
    const admin = await env.provisionUser(
      ['CREATE incidents', 'DELETE incidents', 'READ incidents', 'UPDATE incidents', 'ASSIGN assignments'],
      { organizationId: orgId, roleName: 'admin_org' },
    );
    const operator = await env.provisionUser([], { organizationId: orgId, roleName: 'operador_org' });
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'With relations', ...INSIDE_SANTA_ELENA })
      .expect(201);

    const incidentId = created.body.id as string;
    await env.pg.query('UPDATE incidents SET organization_id = $1 WHERE id = $2', [orgId, incidentId]);

    // Insert a status_history row (correct column names from 0014_status_history.sql)
    await env.pg.query(
      `INSERT INTO status_history (incident_id, previous_status, new_status, event_id, changed_by_user_id)
       VALUES ($1, 'pending', 'in_progress', $2, $3)`,
      [incidentId, randomUUID(), admin.userId],
    );

    // Insert an assignment
    await seedAssignment(incidentId, operator.userId);

    await request(env.httpServer)
      .delete(`/api/incidents/${incidentId}`)
      .set(auth)
      .expect(204);

    const { rows: statusRows } = await env.pg.query(
      `SELECT id FROM status_history WHERE incident_id = $1`,
      [incidentId],
    );
    expect(statusRows.length).toBeGreaterThanOrEqual(1);

    const { rows: assignRows } = await env.pg.query(
      `SELECT id FROM assignments WHERE incident_id = $1`,
      [incidentId],
    );
    expect(assignRows.length).toBeGreaterThanOrEqual(1);
  });

  // ---- T6.2.D2 — assignment soft delete + re-assign -------------------------

  it('T6.2.D2: DELETE /assignments/:id → 204 + row still exists with deleted_at set', async () => {
    const admin = await env.provisionUser(['CREATE incidents', 'ASSIGN assignments'], {
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const operator = await env.provisionUser([], { organizationId: orgId });
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    const incidentId = await seedIncident(admin.userId);
    const assignmentId = await seedAssignment(incidentId, operator.userId);

    await request(env.httpServer)
      .delete(`/api/assignments/${assignmentId}`)
      .set(auth)
      .expect(204);

    const { rows } = await env.pg.query(
      `SELECT deleted_at FROM assignments WHERE id = $1`,
      [assignmentId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('T6.2.D2: re-assign same (incident, operator) pair after soft delete → 201 (no UNIQUE violation)', async () => {
    const admin = await env.provisionUser(['CREATE incidents', 'ASSIGN assignments'], {
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const operator = await env.provisionUser([], { organizationId: orgId });
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    const incidentId = await seedIncident(admin.userId);
    const assignmentId = await seedAssignment(incidentId, operator.userId);

    // Soft delete the assignment
    await request(env.httpServer)
      .delete(`/api/assignments/${assignmentId}`)
      .set(auth)
      .expect(204);

    // Re-assign the same pair — must succeed (partial UNIQUE index allows it)
    await request(env.httpServer)
      .post('/api/assignments')
      .set(auth)
      .send({ incident_id: incidentId, operator_id: operator.userId, role: 'primary' })
      .expect(201);
  });

  // ---- T6.4.A5 — assignment role update -------------------------------------

  it('T6.4.A5: PATCH /assignments/:id { role: "supervisor" } → 200 + role updated', async () => {
    const admin = await env.provisionUser(['CREATE incidents', 'ASSIGN assignments', 'UPDATE assignments'], {
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const operator = await env.provisionUser([], { organizationId: orgId });
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    const incidentId = await seedIncident(admin.userId);
    const assignmentId = await seedAssignment(incidentId, operator.userId);

    const res = await request(env.httpServer)
      .patch(`/api/assignments/${assignmentId}`)
      .set(auth)
      .send({ role: 'supervisor' })
      .expect(200);

    expect(res.body.role).toBe('supervisor');
  });

  it('T6.4.A5: PATCH /assignments/:id { operator_id } → 200 (operator_id regression)', async () => {
    const admin = await env.provisionUser(['CREATE incidents', 'ASSIGN assignments', 'UPDATE assignments'], {
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const op1 = await env.provisionUser([], { organizationId: orgId });
    const op2 = await env.provisionUser([], { organizationId: orgId });
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    const incidentId = await seedIncident(admin.userId);
    const assignmentId = await seedAssignment(incidentId, op1.userId);

    const res = await request(env.httpServer)
      .patch(`/api/assignments/${assignmentId}`)
      .set(auth)
      .send({ operator_id: op2.userId })
      .expect(200);

    expect(res.body.operator_id).toBe(op2.userId);
  });

  it('T6.4.A5: PATCH /assignments/:id without UPDATE permission → 403', async () => {
    const admin = await env.provisionUser(['CREATE incidents', 'ASSIGN assignments'], {
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const operator = await env.provisionUser([], { organizationId: orgId });
    const noPermUser = await env.provisionUser(['READ incidents'], { organizationId: orgId });
    const authAdmin = { Authorization: `Bearer ${admin.accessToken}` };
    const authNoPerms = { Authorization: `Bearer ${noPermUser.accessToken}` };

    const incidentId = await seedIncident(admin.userId);
    const assignmentId = await seedAssignment(incidentId, operator.userId);

    await request(env.httpServer)
      .patch(`/api/assignments/${assignmentId}`)
      .set(authNoPerms)
      .send({ role: 'supervisor' })
      .expect(403);

    // Silence unused var warning
    void authAdmin;
  });
});
