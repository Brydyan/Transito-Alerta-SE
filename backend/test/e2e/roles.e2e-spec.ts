import { randomUUID } from 'crypto';
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

  // ANON (sc-326) — el camino del dispositivo anónimo
  // para crear una incidencia se cerró. El helper ahora
  // crea la incidencia con un `reporter` autenticado, no
  // con la máscara compartida. La firma y semántica
  // observable del test no cambian: las pruebas que
  // usan este helper siguen creando una incidencia
  // cualquiera y operando sobre ella.
  async function createIncidentAnonymously(): Promise<string> {
    const reporter = await env.provisionUser(
      ['CREATE incidents'],
      {
        email: `reporter-${randomUUID()}@example.com`,
        roleName: 'reporter',
        emailVerified: true,
      },
    );

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ title: 'Choque menor', description: 'Sin heridos', lat: -2.2, lng: -80.5 })
      .expect(201);

    return created.body.id as string;
  }

  async function createRole(name: string, permissions: string[]): Promise<string> {
    // F6 fix (post-0051): la columna `roles.permissions` ahora
    // almacena UUIDs (no strings formateados). El helper acepta
    // strings formateados por ergonomía y los traduce via el
    // catálogo (mismo patrón que `provisionUser` en
    // test-environment). Si una entrada ya es UUID, la deja.
    const permissionUuids = await env.resolvePermissionUuids(permissions);
    const { rows } = await env.pg.query<{ id: string }>(
      `INSERT INTO roles (name, description, permissions)
       VALUES ($1, 'e2e role', $2::jsonb)
       RETURNING id`,
      [name, JSON.stringify(permissionUuids)],
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
    // F6 fix (post-0051): el wire es UUIDs. Buscamos los
    // UUIDs de los permisos solicitados y comparamos contra
    // lo que devuelve la API (mismo formato que el
    // backend persiste y compara el PermissionGuard).
    const requested = ['READ incidents', 'READ comments'];
    const roleId = await createRole('read-only-e2e', requested);

    const { rows: catalog } = await env.pg.query<{ id: string; action: string; resource: string }>(
      `SELECT id::text, action, resource FROM permissions WHERE deleted_at IS NULL`,
    );
    const byKey = new Map<string, string>();
    for (const row of catalog) byKey.set(`${row.action} ${row.resource}`, row.id);
    const expectedUuids = requested.map((p) => {
      const uuid = byKey.get(p);
      if (!uuid) throw new Error(`Permission ${p} not in catalog`);
      return uuid;
    });

    const response = await request(env.httpServer)
      .get(`/api/roles/${roleId}/permissions`)
      .set({ Authorization: `Bearer ${admin.accessToken}` })
      .expect(200);

    // El orden no es estable (jsonb set semantics en el backend),
    // comparamos como set.
    expect(new Set(response.body as string[])).toEqual(new Set(expectedUuids));
  });
});
