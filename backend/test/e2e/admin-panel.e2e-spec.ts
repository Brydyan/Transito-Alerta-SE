import { randomUUID } from 'crypto';
import request from 'supertest';

import { NotificationType } from '../../src/modules/notifications/entities/notification.entity';
import { TestEnvironment } from '../support/test-environment';

const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

/**
 * T5.6 — admin panel + CRUD gaps e2e. Focused smoke tests over the
 * new endpoints, not exhaustive coverage (the per-service unit tests
 * cover the algorithms; this e2e is the seam-level guard that the
 * routes, guards, and DTOs are wired correctly).
 */
describe('E2E admin panel + CRUD gaps (T5.6)', () => {
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

  // ---- Roles CRUD ------------------------------------------------------

  it('GET /api/roles returns the seeded roles', async () => {
    const admin = await env.provisionUser(['READ roles'], { roleName: 'master' });
    const res = await request(env.httpServer)
      .get('/api/roles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as Array<{ name: string }>).map((r) => r.name)).toEqual(
      expect.arrayContaining(['master', 'operador_org', 'reporter']),
    );
  });

  it('POST /api/roles creates a new role (admin_sistema only)', async () => {
    const admin = await env.provisionUser(['CREATE roles'], { roleName: 'master' });
    const res = await request(env.httpServer)
      .post('/api/roles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: `tester-${randomUUID().slice(0, 8)}`, permissions: ['READ incidents'] })
      .expect(201);
    expect(res.body.name).toMatch(/^tester-/);
  });

  it('PUT /api/roles/:id/permissions replaces the permission set', async () => {
    const admin = await env.provisionUser(['UPDATE roles'], { roleName: 'master' });
    const reporterId = (await env.pg.query<{ id: string }>("SELECT id FROM roles WHERE name = 'reporter'")).rows[0].id;
    const res = await request(env.httpServer)
      .put(`/api/roles/${reporterId}/permissions`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ permissions: ['READ incidents', 'READ comments'] })
      .expect(200);
    expect((res.body as { permissions: string[] }).permissions).toEqual([
      'READ incidents',
      'READ comments',
    ]);
  });

  // ---- Organizations extras ------------------------------------------

  it('GET /api/organizations/tree returns org list', async () => {
    await env.pg.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [
      randomUUID(),
      'Tree Org',
    ]);
    const user = await env.provisionUser(['READ organizations']);
    const res = await request(env.httpServer)
      .get('/api/organizations/tree')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ---- Comments PATCH -------------------------------------------------

  it('PATCH /api/comments/:id requires ownership (non-author 403)', async () => {
    const author = await env.provisionUser(['CREATE comments', 'UPDATE comments', 'CREATE incidents']);
    const stranger = await env.provisionUser(['UPDATE comments', 'CREATE incidents']);
    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ title: 'C test', ...INSIDE_SANTA_ELENA })
      .expect(201);
    const created = await request(env.httpServer)
      .post('/api/comments')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ incident_id: incident.body.id, content: 'original' })
      .expect(201);
    await request(env.httpServer)
      .patch(`/api/comments/${created.body.id}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ content: 'hijacked' })
      .expect(403);
  });

  it('PATCH /api/comments/:id by author sanitizes XSS and persists', async () => {
    const author = await env.provisionUser(['CREATE comments', 'CREATE incidents']);
    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ title: 'C2', ...INSIDE_SANTA_ELENA })
      .expect(201);
    const created = await request(env.httpServer)
      .post('/api/comments')
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ incident_id: incident.body.id, content: 'original' })
      .expect(201);
    const updated = await request(env.httpServer)
      .patch(`/api/comments/${created.body.id}`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ content: '<script>alert(1)</script> updated' })
      .expect(200);
    expect((updated.body as { content: string }).content).not.toMatch(/<script/);
  });

  // ---- Incidents PATCH/DELETE ----------------------------------------

  it('PATCH /api/incidents/:id updates title (immutable fields stay)', async () => {
    const admin = await env.provisionUser(['CREATE incidents', 'UPDATE incidents']);
    const inc = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ title: 'old', ...INSIDE_SANTA_ELENA })
      .expect(201);
    const res = await request(env.httpServer)
      .patch(`/api/incidents/${inc.body.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ title: 'new' })
      .expect(200);
    expect((res.body as { title: string }).title).toBe('new');
    expect((res.body as { status: string }).status).toBe('pending');
  });

  it('DELETE /api/incidents/:id returns 204', async () => {
    const admin = await env.provisionUser(['CREATE incidents', 'DELETE incidents']);
    const inc = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ title: 'to delete', ...INSIDE_SANTA_ELENA })
      .expect(201);
    await request(env.httpServer)
      .delete(`/api/incidents/${inc.body.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);
  });

  // ---- Notifications approve/reject -----------------------------------

  it('POST /api/notifications/:id/approve on a non-pending_approval notification returns 4xx', async () => {
    const admin = await env.provisionUser(['UPDATE notifications'], { roleName: 'master' });
    const fakeRes = await env.pg.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, message) VALUES (
         (SELECT id FROM users LIMIT 1), $1, 'fake'
       ) RETURNING id`,
      [NotificationType.COMMENT_ADDED],
    );
    const fake = fakeRes.rows[0].id;
    const res = await request(env.httpServer)
      .post(`/api/notifications/${fake}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect([400, 404, 409]).toContain(res.status);
  });

  it('POST /api/notifications/:id/reject on a non-resolved incident returns 4xx', async () => {
    const admin = await env.provisionUser(['UPDATE notifications', 'CREATE incidents'], { roleName: 'master' });
    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ title: 'pending inc', ...INSIDE_SANTA_ELENA })
      .expect(201);
    const fakeRes2 = await env.pg.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, incident_id, message) VALUES (
         (SELECT id FROM users LIMIT 1), $1, $2, 'pending approval'
       ) RETURNING id`,
      [NotificationType.INCIDENT_PENDING_APPROVAL, incident.body.id],
    );
    const fake = fakeRes2.rows[0].id;
    const res = await request(env.httpServer)
      .post(`/api/notifications/${fake}/reject`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'rejection reason long enough to pass validation' });
    expect([400, 404, 409]).toContain(res.status);
  });

  it('POST /api/notifications/:id/approve happy path: incident -> closed, decision columns set', async () => {
    const admin = await env.provisionUser(['UPDATE notifications', 'CREATE incidents'], { roleName: 'master' });
    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ title: 'resolved inc', ...INSIDE_SANTA_ELENA })
      .expect(201);
    // Move to resolved.
    await env.pg.query('UPDATE incidents SET status = $1 WHERE id = $2', [
      'resolved',
      incident.body.id,
    ]);
    const notifRes = await env.pg.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, incident_id, message) VALUES (
         (SELECT id FROM users LIMIT 1), $1, $2, 'awaiting approval'
       ) RETURNING id`,
      [NotificationType.INCIDENT_PENDING_APPROVAL, incident.body.id],
    );
    const notif = notifRes.rows[0].id;

    const res = await request(env.httpServer)
      .post(`/api/notifications/${notif}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);

    expect((res.body as { status: string }).status).toBe('closed');
    const rowRes = await env.pg.query<{ status: string; approved_by: string }>(
      'SELECT status, approved_by FROM incidents WHERE id = $1',
      [incident.body.id],
    );
    const row = rowRes.rows[0];
    expect(row.status).toBe('closed');
    expect(row.approved_by).toBe(admin.userId);
  });
});
