import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';
import { NotificationType } from '../../src/modules/notifications/entities/notification.entity';

/**
 * T6 notifications e2e:
 *  - T6.1.A3: GET /notifications/unread-count
 *  - T6.7.B2: GET /notifications/stream → 410 tombstone
 */
describe('E2E T6 notifications (T6.1.A3, T6.7.B2)', () => {
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

  // ---- T6.1.A3 — GET /notifications/unread-count ---------------------------

  it('T6.1.A3: user with 2 unread notifications → GET /unread-count → 200 { unread_count: 2 }', async () => {
    const user = await env.provisionUser([]);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    // Insert 2 unread notifications directly in the DB.
    await env.pg.query(
      `INSERT INTO notifications (id, user_id, type, message, read)
       VALUES
         ($1, $2, $3, 'notif 1', false),
         ($4, $2, $3, 'notif 2', false)`,
      [randomUUID(), user.userId, NotificationType.INCIDENT_CREATED, randomUUID()],
    );

    const res = await request(env.httpServer)
      .get('/api/notifications/unread-count')
      .set(auth)
      .expect(200);

    expect(res.body).toMatchObject({ unread_count: 2 });
  });

  it('T6.1.A3: GET /notifications/unread-count without token → 401', async () => {
    await request(env.httpServer)
      .get('/api/notifications/unread-count')
      .expect(401);
  });

  // ---- T6.7.B2 — GET /notifications/stream → 410 tombstone -----------------

  it('T6.7.B2: GET /notifications/stream → 410 + body with message', async () => {
    const user = await env.provisionUser([]);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const res = await request(env.httpServer)
      .get('/api/notifications/stream')
      .set(auth)
      .expect(410);

    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });
});
