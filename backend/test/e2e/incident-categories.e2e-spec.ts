import request from 'supertest';

import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * IncidentCategories e2e (T3.7). Real HTTP, real Postgres — proves the
 * recursive-CTE subtree read, the ancestor-walk cycle guard, and the
 * ON DELETE SET NULL / ON DELETE RESTRICT schema behaviors actually hold
 * end to end, not just against mocked repositories.
 */
describe('IncidentCategories e2e (T3.7)', () => {
  let env: TestEnvironment;
  let admin: ProvisionedUser;
  let reader: ProvisionedUser;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    admin = await env.provisionUser([
      'CREATE incident-categories',
      'READ incident-categories',
      'UPDATE incident-categories',
      'DELETE incident-categories',
    ]);
    reader = await env.provisionUser(['READ incident-categories']);
  });

  function authHeader(user: ProvisionedUser) {
    return { Authorization: `Bearer ${user.accessToken}` };
  }

  function createCategory(
    body: { name: string; parent_id?: string },
    asUser: ProvisionedUser = admin,
  ): request.Test {
    return request(env.httpServer)
      .post('/api/incident-categories')
      .set(authHeader(asUser))
      .send(body);
  }

  // TS-1: Create Root Category
  it('creates a root category and lists it under GET /tree (TS-1)', async () => {
    const created = await createCategory({ name: 'Traffic' }).expect(201);

    expect(created.body).toMatchObject({ name: 'Traffic', parent_id: null });
    expect(created.body.id).toEqual(expect.any(String));

    const tree = await request(env.httpServer)
      .get('/api/incident-categories/tree')
      .set(authHeader(reader))
      .expect(200);

    expect(tree.body).toHaveLength(1);
    expect(tree.body[0]).toMatchObject({ id: created.body.id, name: 'Traffic' });
  });

  // TS-2: Create Child Category
  it('creates a child category nested under its parent in GET /tree (TS-2)', async () => {
    const root = await createCategory({ name: 'Traffic' }).expect(201);

    const child = await createCategory({
      name: 'Accident',
      parent_id: root.body.id as string,
    }).expect(201);

    expect(child.body.parent_id).toBe(root.body.id);

    const tree = await request(env.httpServer)
      .get('/api/incident-categories/tree')
      .set(authHeader(reader))
      .expect(200);

    expect(tree.body).toHaveLength(1);
    expect(tree.body[0].children).toHaveLength(1);
    expect(tree.body[0].children[0]).toMatchObject({ id: child.body.id, name: 'Accident' });
  });

  // TS-3: Reject Cycle on Create (via re-parent chain set up, then PATCH)
  it('rejects a circular parent_id on create/update — re-parenting an ancestor to its own descendant (TS-3)', async () => {
    const a = await createCategory({ name: 'A' }).expect(201);
    const b = await createCategory({ name: 'B', parent_id: a.body.id as string }).expect(201);
    const c = await createCategory({ name: 'C', parent_id: b.body.id as string }).expect(201);

    const response = await request(env.httpServer)
      .patch(`/api/incident-categories/${a.body.id as string}`)
      .set(authHeader(admin))
      .send({ parent_id: c.body.id as string })
      .expect(400);

    expect(response.body.message).toMatch(/circular/i);
  });

  // TS-4: Full Subtree Query at Depth >= 3
  it('returns the full nested subtree at depth >= 3, sorted by name per level (TS-4)', async () => {
    const root = await createCategory({ name: 'Root' }).expect(201);
    const child1 = await createCategory({
      name: 'Child1',
      parent_id: root.body.id as string,
    }).expect(201);
    await createCategory({ name: 'Child2', parent_id: root.body.id as string }).expect(201);
    await createCategory({
      name: 'GrandChild1',
      parent_id: child1.body.id as string,
    }).expect(201);

    const tree = await request(env.httpServer)
      .get('/api/incident-categories/tree')
      .set(authHeader(reader))
      .expect(200);

    expect(tree.body).toHaveLength(1);
    const rootNode = tree.body[0];
    expect(rootNode.name).toBe('Root');
    expect(rootNode.children.map((n: { name: string }) => n.name)).toEqual(['Child1', 'Child2']);
    const child1Node = rootNode.children[0];
    expect(child1Node.children).toHaveLength(1);
    expect(child1Node.children[0].name).toBe('GrandChild1');
  });

  // TS-5: Paginated List with Filter
  it('paginates and filters the flat list by search + parent_id (TS-5)', async () => {
    const root = await createCategory({ name: 'Parent' }).expect(201);
    for (let i = 0; i < 3; i += 1) {
      await createCategory({ name: `Incident${i}`, parent_id: root.body.id as string }).expect(
        201,
      );
    }
    await createCategory({ name: 'Unrelated' }).expect(201);

    const filtered = await request(env.httpServer)
      .get('/api/incident-categories')
      .query({ search: 'Incident', per_page: 2, page: 1 })
      .set(authHeader(reader))
      .expect(200);

    expect(filtered.body.total).toBe(3);
    expect(filtered.body.items).toHaveLength(2);
    expect(
      filtered.body.items.every((item: { name: string }) => item.name.startsWith('Incident')),
    ).toBe(true);
  });

  // TS-6: Reject Descendant Re-parent on Update
  it('rejects re-parenting a category to one of its own descendants (TS-6)', async () => {
    const a = await createCategory({ name: 'A' }).expect(201);
    const b = await createCategory({ name: 'B', parent_id: a.body.id as string }).expect(201);
    const c = await createCategory({ name: 'C', parent_id: b.body.id as string }).expect(201);

    const response = await request(env.httpServer)
      .patch(`/api/incident-categories/${a.body.id as string}`)
      .set(authHeader(admin))
      .send({ parent_id: c.body.id as string })
      .expect(400);

    expect(response.body.message).toMatch(/circular/i);
  });

  // TS-7: Delete Category with Children (SET NULL)
  it('promotes children to roots when their parent is deleted (TS-7)', async () => {
    const root = await createCategory({ name: 'Root' }).expect(201);
    const child = await createCategory({
      name: 'Child',
      parent_id: root.body.id as string,
    }).expect(201);

    await request(env.httpServer)
      .delete(`/api/incident-categories/${root.body.id as string}`)
      .set(authHeader(admin))
      .expect(204);

    const refreshed = await request(env.httpServer)
      .get(`/api/incident-categories/${child.body.id as string}`)
      .set(authHeader(reader))
      .expect(200);

    expect(refreshed.body.parent_id).toBeNull();
  });

  // TS-8: Delete Category Referenced by Incident (RESTRICT -> 409)
  it('blocks deleting a category referenced by an incident (409) (TS-8)', async () => {
    const category = await createCategory({ name: 'Referenced' }).expect(201);

    const login = await request(env.httpServer)
      .post('/api/auth/login')
      .send({ device_uuid: 'anonymous' })
      .expect(200);

    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${login.body.access_token as string}` })
      .send({ title: 'Choque', description: 'Sin heridos', lat: -2.2, lng: -80.5 })
      .expect(201);

    await env.pg.query('UPDATE incidents SET category_id = $1 WHERE id = $2', [
      category.body.id,
      incident.body.id,
    ]);

    const response = await request(env.httpServer)
      .delete(`/api/incident-categories/${category.body.id as string}`)
      .set(authHeader(admin))
      .expect(409);

    expect(response.body.message).toMatch(/referenced/i);

    await request(env.httpServer)
      .get(`/api/incident-categories/${category.body.id as string}`)
      .set(authHeader(reader))
      .expect(200);
  });

  // TS-9: 404 on Missing Category
  it('returns 404 for GET/PATCH/DELETE on a non-existent category (TS-9)', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';

    await request(env.httpServer)
      .get(`/api/incident-categories/${missingId}`)
      .set(authHeader(reader))
      .expect(404);

    await request(env.httpServer)
      .patch(`/api/incident-categories/${missingId}`)
      .set(authHeader(admin))
      .send({ name: 'X' })
      .expect(404);

    await request(env.httpServer)
      .delete(`/api/incident-categories/${missingId}`)
      .set(authHeader(admin))
      .expect(404);
  });

  // TS-10: Permission Guards
  it('rejects mutating requests from a caller without the matching permission (403) (TS-10)', async () => {
    await createCategory({ name: 'Blocked' }, reader).expect(403);

    const category = await createCategory({ name: 'Existing' }).expect(201);

    await request(env.httpServer)
      .patch(`/api/incident-categories/${category.body.id as string}`)
      .set(authHeader(reader))
      .send({ name: 'Renamed' })
      .expect(403);

    await request(env.httpServer)
      .delete(`/api/incident-categories/${category.body.id as string}`)
      .set(authHeader(reader))
      .expect(403);
  });
});
