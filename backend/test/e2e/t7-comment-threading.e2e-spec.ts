import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

/**
 * T7.4 — comments threading (0033). R9.1–R9.8.
 *
 * R9.1/R9.2 are schema-level (column/FK/index/CHECK) and are asserted
 * directly against Postgres via `env.pg`, reusing the already-booted
 * TestEnvironment stack instead of a separate MigrationHarness — this file
 * is the single source of truth for D7.4's behaviour AND schema contract.
 */
describe('E2E T7.4 comment threading (0033)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  async function seedIncident(ownerId: string): Promise<string> {
    const incidentId = randomUUID();
    await env.pg.query(
      `INSERT INTO incidents (id, title, location, status, priority, citizen_id)
       VALUES ($1, 'Test', ST_SetSRID(ST_MakePoint(-80.5, -2.2), 4326), 'pending', 'medium', $2)`,
      [incidentId, ownerId],
    );
    return incidentId;
  }

  // ---- R9.1 — Columna y FK creadas ------------------------------------

  it('R9.1: comments.parent_id exists, self-referencial FK ON DELETE CASCADE, indexed', async () => {
    const { rows: colRows } = await env.pg.query(
      `SELECT is_nullable, data_type FROM information_schema.columns
       WHERE table_name = 'comments' AND column_name = 'parent_id'`,
    );
    expect(colRows).toHaveLength(1);
    expect(colRows[0].is_nullable).toBe('YES');
    expect(colRows[0].data_type).toBe('uuid');

    const { rows: fkRows } = await env.pg.query(
      `SELECT confdeltype FROM pg_constraint
       WHERE conrelid = 'comments'::regclass AND contype = 'f'
         AND confrelid = 'comments'::regclass`,
    );
    expect(fkRows).toHaveLength(1);
    expect(fkRows[0].confdeltype).toBe('c'); // 'c' = CASCADE

    const { rows: idxRows } = await env.pg.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'comments' AND indexdef ILIKE '%parent_id%'`,
    );
    expect(idxRows.length).toBeGreaterThan(0);
  });

  // ---- R9.2 — Auto-referencia rechazada -------------------------------

  it('R9.2: UPDATE comments SET parent_id = id WHERE id = id violates CHECK', async () => {
    const user = await env.provisionUser(['CREATE comments']);
    const incidentId = await seedIncident(user.userId);
    const commentId = randomUUID();
    await env.pg.query(
      `INSERT INTO comments (id, content, incident_id, user_id) VALUES ($1, 'root', $2, $3)`,
      [commentId, incidentId, user.userId],
    );

    await expect(
      env.pg.query(`UPDATE comments SET parent_id = $1 WHERE id = $1`, [commentId]),
    ).rejects.toThrow(/chk_comments_no_self_parent|check constraint/i);
  });

  // ---- R9.3 — Crear respuesta a un comentario -------------------------

  it('R9.3: POST a comment with parent_id → 201 with parent_id populated', async () => {
    const user = await env.provisionUser(['CREATE comments']);
    const incidentId = await seedIncident(user.userId);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const rootRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'root comment' })
      .expect(201);
    const rootId = rootRes.body.id as string;

    const replyRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'a reply', parent_id: rootId })
      .expect(201);

    expect(replyRes.body.parent_id).toBe(rootId);
  });

  // ---- R9.4 — parent_id de otro incidente es rechazado ----------------

  it('R9.4: parent_id belonging to a different incident → 400', async () => {
    const user = await env.provisionUser(['CREATE comments']);
    const incidentA = await seedIncident(user.userId);
    const incidentB = await seedIncident(user.userId);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const rootRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentA, content: 'root in A' })
      .expect(201);
    const rootId = rootRes.body.id as string;

    await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentB, content: 'reply in B', parent_id: rootId })
      .expect(400);
  });

  // ---- R9.5 — Se puede responder a una respuesta (profundidad 2) -----

  it('R9.5: replying to a reply (depth 1) succeeds → new comment is depth 2', async () => {
    const user = await env.provisionUser(['CREATE comments', 'READ comments']);
    const incidentId = await seedIncident(user.userId);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const rootRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'root' })
      .expect(201);
    const rootId = rootRes.body.id as string;

    const replyRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'reply', parent_id: rootId })
      .expect(201);
    const replyId = replyRes.body.id as string;

    const grandchildRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'grandchild', parent_id: replyId })
      .expect(201);

    expect(grandchildRes.body.parent_id).toBe(replyId);

    const listRes = await request(env.httpServer)
      .get(`/api/comments/incident/${incidentId}`)
      .set(auth)
      .expect(200);
    const grandchild = (listRes.body as Array<{ id: string; depth: number }>).find(
      (c) => c.id === grandchildRes.body.id,
    );
    expect(grandchild?.depth).toBe(2);
  });

  // ---- R9.6 — La profundidad 3 es rechazada ---------------------------

  it('R9.6: replying to a depth-2 comment → 400', async () => {
    const user = await env.provisionUser(['CREATE comments']);
    const incidentId = await seedIncident(user.userId);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const rootRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'root' })
      .expect(201);
    const replyRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'reply', parent_id: rootRes.body.id })
      .expect(201);
    const grandchildRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'grandchild', parent_id: replyRes.body.id })
      .expect(201);

    await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'too deep', parent_id: grandchildRes.body.id })
      .expect(400);
  });

  // ---- R9.7 — El listado expone la profundidad de cada comentario ----

  it('R9.7: GET list includes calculated depth 0/1/2 for each comment', async () => {
    const user = await env.provisionUser(['CREATE comments', 'READ comments']);
    const incidentId = await seedIncident(user.userId);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const rootRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'root' })
      .expect(201);
    const replyRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'reply', parent_id: rootRes.body.id })
      .expect(201);
    const grandchildRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'grandchild', parent_id: replyRes.body.id })
      .expect(201);

    const listRes = await request(env.httpServer)
      .get(`/api/comments/incident/${incidentId}`)
      .set(auth)
      .expect(200);

    const byId = new Map(
      (listRes.body as Array<{ id: string; depth: number }>).map((c) => [c.id, c.depth]),
    );
    expect(byId.get(rootRes.body.id)).toBe(0);
    expect(byId.get(replyRes.body.id)).toBe(1);
    expect(byId.get(grandchildRes.body.id)).toBe(2);
  });

  // ---- R9.8 — Borrar la raíz arrastra todo el hilo, incluidos nietos --

  it('R9.8: soft-deleting the root cascades to replies and grandchildren', async () => {
    const user = await env.provisionUser(['CREATE comments', 'READ comments', 'DELETE comments']);
    const incidentId = await seedIncident(user.userId);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const rootRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'root' })
      .expect(201);
    const reply1Res = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'reply 1', parent_id: rootRes.body.id })
      .expect(201);
    const reply2Res = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'reply 2', parent_id: rootRes.body.id })
      .expect(201);
    const grandchildRes = await request(env.httpServer)
      .post('/api/comments')
      .set(auth)
      .send({ incident_id: incidentId, content: 'grandchild', parent_id: reply1Res.body.id })
      .expect(201);

    await request(env.httpServer)
      .delete(`/api/comments/${rootRes.body.id}`)
      .set(auth)
      .expect(204);

    const { rows } = await env.pg.query(
      `SELECT id FROM comments WHERE incident_id = $1 AND deleted_at IS NOT NULL`,
      [incidentId],
    );
    const deletedIds = rows.map((r: { id: string }) => r.id).sort();
    expect(deletedIds.sort()).toEqual(
      [rootRes.body.id, reply1Res.body.id, reply2Res.body.id, grandchildRes.body.id].sort(),
    );

    const listRes = await request(env.httpServer)
      .get(`/api/comments/incident/${incidentId}`)
      .set(auth)
      .expect(200);
    expect(listRes.body).toEqual([]);
  });
});
