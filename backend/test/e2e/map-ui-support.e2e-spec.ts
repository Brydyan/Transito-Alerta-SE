import { randomUUID } from 'crypto';
import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';

/**
 * T5.4 — E2E for the map-catalog and users-form-data endpoints. Both
 * reference data — no behavioral surprises, just a real round-trip
 * through JwtAuthGuard, PermissionGuard, and the SQL path.
 */
describe('E2E map UI support — map filters + users form-data (T5.4)', () => {
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
    // Seed 3 categories in non-alphabetical order to verify the ASC sort.
    await env.pg.query(
      'INSERT INTO incident_categories (id, name, parent_id) VALUES ($1, $2, NULL), ($3, $4, NULL), ($5, $6, NULL)',
      [randomUUID(), 'Choque', randomUUID(), 'Accidente', randomUUID(), 'Bloqueo'],
    );
  });

  // ---- /api/map/filters -----------------------------------------------

  it('GET /api/map/filters returns categories sorted alphabetically (any authenticated user)', async () => {
    const user = await env.provisionUser(['CREATE incidents']);

    const response = await request(env.httpServer)
      .get('/api/map/filters')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(response.body.data.categories.map((c: { name: string }) => c.name)).toEqual([
      'Accidente',
      'Bloqueo',
      'Choque',
    ]);
    expect(response.body.data.categories).toHaveLength(3);
    for (const c of response.body.data.categories) {
      expect(c).toEqual({ id: expect.any(String), name: expect.any(String) });
    }
  });

  it('GET /api/map/filters without auth returns 401', async () => {
    await request(env.httpServer).get('/api/map/filters').expect(401);
  });

  // ---- /api/users/form-data -------------------------------------------

  it('system admin sees all roles and all organizations, both lists sorted ASC by name', async () => {
    const admin = await env.provisionUser(['READ users'], { roleName: 'admin_sistema' });

    const response = await request(env.httpServer)
      .get('/api/users/form-data')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    const roleNames = (response.body.roles as Array<{ name: string }>).map((r) => r.name);
    const orgNames = (response.body.organizations as Array<{ name: string }>).map((o) => o.name);

    // Membership: every seeded role / every org the test inserted shows up.
    expect(roleNames).toContain('admin_sistema');
    expect(roleNames).toContain('operador_organizacion');
    expect(roleNames).toContain('reporter');
    const orgIds = (response.body.organizations as Array<{ id: string }>).map((o) => o.id);
    expect(orgIds).toEqual(expect.arrayContaining([orgA, orgB]));

    // Sort: ASC by name is the contract — pin the property, not the literal
    // seed order, so the test survives any new role migrations.
    expect(roleNames).toEqual([...roleNames].sort());
    expect(orgNames).toEqual([...orgNames].sort());
  });

  it('org admin: system-only roles excluded, only own organization returned, sorted ASC', async () => {
    const opAdmin = await env.provisionUser(['READ users'], {
      organizationId: orgA,
      roleName: 'admin_organizacion',
    });

    const response = await request(env.httpServer)
      .get('/api/users/form-data')
      .set('Authorization', `Bearer ${opAdmin.accessToken}`)
      .expect(200);

    const roleNames = (response.body.roles as Array<{ name: string }>).map((r) => r.name);
    expect(roleNames).not.toContain('admin_sistema');
    expect(roleNames).not.toContain('operador_sistema');
    expect(roleNames).toContain('operador_organizacion');
    expect(roleNames).toContain('reporter');
    const orgIds = (response.body.organizations as Array<{ id: string }>).map((o) => o.id);
    expect(orgIds).toEqual([orgA]);
    // Sort contract still holds for the org-admin's restricted view.
    expect(roleNames).toEqual([...roleNames].sort());
  });

  it('caller without READ users permission gets 403', async () => {
    const citizen = await env.provisionUser(['CREATE incidents'], {
      roleName: 'reporter',
    });
    await request(env.httpServer)
      .get('/api/users/form-data')
      .set('Authorization', `Bearer ${citizen.accessToken}`)
      .expect(403);
  });

  it('unauthenticated form-data request returns 401', async () => {
    await request(env.httpServer).get('/api/users/form-data').expect(401);
  });
});
