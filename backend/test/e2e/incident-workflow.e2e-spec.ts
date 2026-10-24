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
      roleName: 'operator_org',
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
      roleName: 'operator_org',
    });
    const op2 = await env.provisionUser(['CLAIM incidents'], {
      organizationId: orgA,
      roleName: 'operator_org',
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
      roleName: 'operator_org',
    });

    // Create incident from a same-org creator and pin orgA on it.
    const creator = await env.provisionUser(['CREATE incidents'], {
      organizationId: orgA,
      roleName: 'operator_org',
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
      roleName: 'operator_org',
    });
    const op2 = await env.provisionUser(['RELEASE incidents'], {
      organizationId: orgA,
      roleName: 'operator_org',
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
      roleName: 'operator_org',
    });
    const op2 = await env.provisionUser(['READ incidents'], {
      organizationId: orgA,
      roleName: 'operator_org',
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
      roleName: 'operator_org',
    });
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${creator.accessToken}`)
      .send({ title: 'No auth claim', ...INSIDE_SANTA_ELENA })
      .expect(201);
    await env.pg.query('UPDATE incidents SET organization_id = $1 WHERE id = $2', [orgA, created.body.id]);

    await request(env.httpServer).post(`/api/incidents/${created.body.id}/claim`).expect(401);
  });

  // ---- available-operators (bug-fix A + B) ------------------------------
  //
  // Bug-fix (this change):
  //   A) `name` was aliased to `device_uuid` (a UUID), so the
  //      assign-dialog rendered an unreadable list. Now `name` comes
  //      from `first_name || ' ' || last_name`, trimmed.
  //   B) The endpoint returned every eligible operator in the org.
  //      For categorized incidents it must restrict to operators whose
  //      `department_id` is in the set of depts that handle the
  //      incident's category (via `department_incident_categories`),
  //      with a dept-less (polyvalent) fallback.
  //
  // The two scenarios below are the regression guards.

  /**
   * Sets a real `first_name` / `last_name` / `department_id` on a
   * freshly-provisioned user. The harness's `provisionUser()` does
   * not write name parts or dept_id, so we patch in SQL after the
   * INSERT to model the real wire contract — a logged-in operator that
   * the dispatch UI is supposed to render by name.
   */
  async function decorateOperator(opts: {
    organizationId: string;
    roleName?: string;
    permissions: string[];
    firstName: string;
    lastName: string;
    departmentId: string | null;
  }): Promise<ProvisionedUser> {
    const user = await env.provisionUser(opts.permissions, {
      organizationId: opts.organizationId,
      roleName: opts.roleName ?? 'operator_org',
    });
    await env.pg.query(
      `UPDATE users
          SET first_name = $1, last_name = $2, department_id = $3
        WHERE id = $4`,
      [opts.firstName, opts.lastName, opts.departmentId, user.userId],
    );
    return user;
  }

  it('categorized: includes operators from depts that handle the category, excludes others, includes dept-less operators; name is human-readable (bug-fix A+B)', async () => {
    // ── Setup ──────────────────────────────────────────────────────────
    // 1) Two depts in orgA. Dept-1 handles the target category, Dept-2 does NOT.
    const { rows: deptHandlingRows } = await env.pg.query<{ id: string }>(
      `INSERT INTO departments (name, organization_id)
       VALUES ($1, $2)
       RETURNING id`,
      [`traffic-handlers-${randomUUID()}`, orgA],
    );
    const deptHandlingId = deptHandlingRows[0].id;

    const { rows: deptIgnoringRows } = await env.pg.query<{ id: string }>(
      `INSERT INTO departments (name, organization_id)
       VALUES ($1, $2)
       RETURNING id`,
      [`traffic-ignoring-${randomUUID()}`, orgA],
    );
    const deptIgnoringId = deptIgnoringRows[0].id;

    // 2) Two categories. Cat-handled will be linked to dept-1 only.
    const { rows: catHandledRows } = await env.pg.query<{ id: string }>(
      `INSERT INTO incident_categories (name) VALUES ($1) RETURNING id`,
      [`accident-${randomUUID()}`],
    );
    const catHandledId = catHandledRows[0].id;

    await env.pg.query(
      `INSERT INTO department_incident_categories (department_id, incident_category_id)
       VALUES ($1, $2)`,
      [deptHandlingId, catHandledId],
    );

    const { rows: catOtherRows } = await env.pg.query<{ id: string }>(
      `INSERT INTO incident_categories (name) VALUES ($1) RETURNING id`,
      [`other-${randomUUID()}`],
    );
    const catOtherId = catOtherRows[0].id;

    // 3) Operators:
    //    - `opInDeptHandling`: dept-1, handles cat-handled → SHOULD appear.
    //    - `opInDeptIgnoring`: dept-2, no link to cat-handled → MUST NOT appear.
    //    - `opNoDept`: dept NULL → SHOULD appear (polyvalent fallback).
    //    - `opInOtherOrg`: a separate org → MUST NOT appear (org filter).
    const opInDeptHandling = await decorateOperator({
      organizationId: orgA,
      permissions: ['READ incidents'],
      firstName: 'Ada',
      lastName: 'Handler',
      departmentId: deptHandlingId,
    });
    const opInDeptIgnoring = await decorateOperator({
      organizationId: orgA,
      permissions: ['READ incidents'],
      firstName: 'Bob',
      lastName: 'Ignorer',
      departmentId: deptIgnoringId,
    });
    const opNoDept = await decorateOperator({
      organizationId: orgA,
      permissions: ['READ incidents'],
      firstName: 'Cira',
      lastName: 'Polyvalent',
      departmentId: null,
    });
    const opInOtherOrg = await decorateOperator({
      organizationId: orgB,
      permissions: ['READ incidents'],
      firstName: 'Dave',
      lastName: 'Outsider',
      departmentId: null,
    });
    // The "reader" must also be able to create an incident to put a
    // row in the DB for `available-operators` to read. Same
    // permission set as the other operators in this scenario so the
    // reader doubles as a normal eligible operator too.
    const reader = await env.provisionUser(['CREATE incidents', 'READ incidents'], {
      organizationId: orgA,
      roleName: 'operator_org',
    });

    // 4) Create an incident in orgA with `category_id = catHandledId`.
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${reader.accessToken}`)
      .send({ title: 'Accidente con categoria', ...INSIDE_SANTA_ELENA })
      .expect(201);
    await env.pg.query(
      `UPDATE incidents
          SET organization_id = $1, category_id = $2
        WHERE id = $3`,
      [orgA, catHandledId, created.body.id],
    );

    // ── Exercise ───────────────────────────────────────────────────────
    const response = await request(env.httpServer)
      .get(`/api/incidents/${created.body.id}/available-operators`)
      .set('Authorization', `Bearer ${reader.accessToken}`)
      .expect(200);

    const body = response.body as Array<{
      id: string;
      name: string;
      email: string | null;
      // wire format is snake_case (SnakeCaseResponseInterceptor);
      // the DTO uses camelCase, but the interceptor converts at the
      // HTTP boundary.
      active_claim_count: number;
      available: boolean;
      max_active: number;
    }>;
    const ids = body.map((o) => o.id);

    // Inclusion
    expect(ids).toContain(opInDeptHandling.userId); // dept handles the cat
    expect(ids).toContain(opNoDept.userId); // polyvalent fallback

    // Exclusion
    expect(ids).not.toContain(opInDeptIgnoring.userId); // dept does NOT handle the cat
    expect(ids).not.toContain(opInOtherOrg.userId); // other org

    // Bug-fix (A): human-readable name, NOT a UUID.
    const handlerEntry = body.find((o) => o.id === opInDeptHandling.userId);
    expect(handlerEntry).toBeDefined();
    expect(handlerEntry!.name).toBe('Ada Handler');
    // Guard against the original bug returning.
    expect(handlerEntry!.name).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/i);

    // Sanity: the unrelated `catOtherId` is not queried — only the
    // incident's own category drives the filter.
    expect(catOtherId).toBeDefined();

    // Assert response keys still match the DTO contract (no breakage).
    // Wire is snake_case (SnakeCaseResponseInterceptor) — the DTO uses
    // camelCase but the interceptor converts at the HTTP boundary.
    for (const op of body) {
      expect(typeof op.id).toBe('string');
      expect(typeof op.name).toBe('string');
      // Bug-fix (A) guard: never a UUID on the wire.
      expect(op.name).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/i);
      // email can be null when the operator has no mail configured.
      expect(['string', 'object']).toContain(typeof op.email);
      expect(typeof op.active_claim_count).toBe('number');
      expect(typeof op.available).toBe('boolean');
      expect(typeof op.max_active).toBe('number');
    }
  });

  it('un-categorized: returns every eligible operator in the org (pre-fix fallback path)', async () => {
    // No department_incident_categories link for the incident's
    // category_id → the service takes the fallback branch.
    const { rows: deptRows } = await env.pg.query<{ id: string }>(
      `INSERT INTO departments (name, organization_id)
       VALUES ($1, $2)
       RETURNING id`,
      [`fallback-dept-${randomUUID()}`, orgA],
    );
    const deptId = deptRows[0].id;

    // Operators across depts all eligible — the un-categorized branch
    // does not apply the dept filter.
    const op1 = await decorateOperator({
      organizationId: orgA,
      permissions: ['READ incidents'],
      firstName: 'Eve',
      lastName: 'One',
      departmentId: deptId,
    });
    const op2 = await decorateOperator({
      organizationId: orgA,
      permissions: ['READ incidents'],
      firstName: 'Fede',
      lastName: 'Two',
      departmentId: null,
    });
    // Same pattern as the categorized test above: the reader needs
    // CREATE incidents to plant a row. We use a separate creator so
    // `op1` / `op2` keep their narrower permission set and stay
    // eligible-but-not-creators.
    const reader = await env.provisionUser(['CREATE incidents', 'READ incidents'], {
      organizationId: orgA,
      roleName: 'operator_org',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${reader.accessToken}`)
      .send({ title: 'Sin categoria', ...INSIDE_SANTA_ELENA })
      .expect(201);
    await env.pg.query(
      `UPDATE incidents
          SET organization_id = $1, category_id = NULL
        WHERE id = $2`,
      [orgA, created.body.id],
    );

    const response = await request(env.httpServer)
      .get(`/api/incidents/${created.body.id}/available-operators`)
      .set('Authorization', `Bearer ${reader.accessToken}`)
      .expect(200);

    const ids = (response.body as Array<{ id: string }>).map((o) => o.id);
    expect(ids).toContain(op1.userId);
    expect(ids).toContain(op2.userId);

    // Bug-fix (A) verification on the fallback path: the wire name is
    // still human-readable, never a UUID.
    const names = (response.body as Array<{ name: string }>).map((o) => o.name);
    for (const n of names) {
      expect(n).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/i);
    }
  });
});
