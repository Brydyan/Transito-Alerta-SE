import request from 'supertest';

import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * Roles + Permissions e2e (T3.1, R6/R7). Real HTTP, real Postgres, real
 * Redis — proves what unit tests (mocked repos/cache) cannot: that a role
 * reassignment actually invalidates the cached permission blob a
 * still-live access token resolves against, without reissuing that token.
 */
describe('Roles + Permissions e2e (T3.1)', () => {
  let env: TestEnvironment;
  let admin: ProvisionedUser;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    admin = await env.provisionUser(['ASSIGN roles', 'READ roles']);
  });

  async function createIncidentAnonymously(): Promise<string> {
    const login = await request(env.httpServer)
      .post('/api/auth/login')
      .send({ device_uuid: 'anonymous' })
      .expect(200);

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${login.body.access_token}` })
      .send({ title: 'Choque menor', description: 'Sin heridos', lat: -2.2, lng: -80.5 })
      .expect(201);

    return created.body.id as string;
  }

  async function createRole(name: string, permissions: string[]): Promise<string> {
    const { rows } = await env.pg.query<{ id: string }>(
      `INSERT INTO roles (name, description, permissions)
       VALUES ($1, 'e2e role', $2::jsonb)
       RETURNING id`,
      [name, JSON.stringify(permissions)],
    );
    return rows[0].id;
  }

  function assignRole(roleId: string, userId: string, asUser = admin): request.Test {
    return request(env.httpServer)
      .post(`/api/roles/${roleId}/assign`)
      .set({ Authorization: `Bearer ${asUser.accessToken}` })
      .send({ user_id: userId });
  }

  it('a user whose only role has no permissions is refused a mutating endpoint (403) (R6)', async () => {
    const target = await env.provisionUser([]);
    const emptyRoleId = await createRole('empty-role-e2e', []);
    await assignRole(emptyRoleId, target.userId).expect(201);

    const incidentId = await createIncidentAnonymously();

    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set({ Authorization: `Bearer ${target.accessToken}` })
      .send({ status: 'in_progress' })
      .expect(403);
  });

  it(
    'reassigning a role changes what that same user may do on the very next request — ' +
      'the cached blob was invalidated, not merely marked stale (R6/D2)',
    async () => {
      const target = await env.provisionUser([]);
      const incidentId = await createIncidentAnonymously();

      // Warm the target's cached (empty) permission set under the real
      // request path — proves the cache this reassignment must bust is the
      // one an in-flight request actually reads from, not a hand-inserted
      // key nobody would ever consult.
      await request(env.httpServer)
        .patch(`/api/incidents/${incidentId}/status`)
        .set({ Authorization: `Bearer ${target.accessToken}` })
        .send({ status: 'in_progress' })
        .expect(403);

      const operatorRoleId = await createRole('operator-e2e', ['UPDATE incidents']);
      await assignRole(operatorRoleId, target.userId).expect(201);

      // Same access token as before — not re-issued, not re-logged-in. If
      // this only worked after a fresh login, the cache would merely be
      // stale-tolerant, not actually invalidated.
      const afterReassign = await request(env.httpServer)
        .patch(`/api/incidents/${incidentId}/status`)
        .set({ Authorization: `Bearer ${target.accessToken}` })
        .send({ status: 'in_progress' })
        .expect(200);

      expect(afterReassign.body.status).toBe('in_progress');
    },
  );

  it('assigning an unknown role returns 404, without granting anything', async () => {
    const target = await env.provisionUser([]);

    await assignRole('00000000-0000-0000-0000-000000000000', target.userId).expect(404);
  });

  it('a caller without ASSIGN roles cannot reassign roles (CC1)', async () => {
    const target = await env.provisionUser([]);
    const nonAdmin = await env.provisionUser(['READ incidents']);
    const operatorRoleId = await createRole('operator-e2e-2', ['UPDATE incidents']);

    await assignRole(operatorRoleId, target.userId, nonAdmin).expect(403);
  });

  it("GET /roles/:id/permissions returns the role's composed permission set (R7)", async () => {
    const roleId = await createRole('read-only-e2e', ['READ incidents', 'READ comments']);

    const response = await request(env.httpServer)
      .get(`/api/roles/${roleId}/permissions`)
      .set({ Authorization: `Bearer ${admin.accessToken}` })
      .expect(200);

    expect(response.body).toEqual(['READ incidents', 'READ comments']);
  });
});
