import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

// Minimal JPEG header (SOI + APP0 marker) — recognized by most MIME sniffers.
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const FAKE_PDF = Buffer.from('%PDF-1.4\n%EOF');

describe('E2E comment images (T5.5)', () => {
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

  /** Seed an incident + comment directly in the DB; returns { incidentId, commentId }. */
  async function seedCommentFixture(ownerId: string): Promise<{ incidentId: string; commentId: string }> {
    const incidentId = randomUUID();
    await env.pg.query(
      `INSERT INTO incidents (id, title, location, status, priority, citizen_id)
       VALUES ($1, 'Test', ST_SetSRID(ST_MakePoint(-80.5, -2.2), 4326), 'pending', 'medium', $2)`,
      [incidentId, ownerId],
    );
    const commentId = randomUUID();
    await env.pg.query(
      `INSERT INTO comments (id, content, incident_id, user_id) VALUES ($1, $2, $3, $4)`,
      [commentId, 'A comment', incidentId, ownerId],
    );
    return { incidentId, commentId };
  }

  // ---- POST /api/comments/:id/images ----------------------------------------

  it('POST 2 JPEG files by owner → 201, response has 2 items, DB has 2 rows', async () => {
    const owner = await env.provisionUser(['CREATE comments']);
    const { commentId } = await seedCommentFixture(owner.userId);

    const res = await request(env.httpServer)
      .post(`/api/comments/${commentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo1.jpg', contentType: 'image/jpeg' })
      .attach('images', FAKE_JPEG, { filename: 'photo2.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const body = res.body as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    const { rows } = await env.pg.query(
      'SELECT id FROM comment_images WHERE comment_id = $1',
      [commentId],
    );
    expect(rows).toHaveLength(2);
  });

  it('POST 6 files → 400/422 (Multer count limit)', async () => {
    const owner = await env.provisionUser(['CREATE comments']);
    const { commentId } = await seedCommentFixture(owner.userId);

    const req = request(env.httpServer)
      .post(`/api/comments/${commentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    for (let i = 0; i < 6; i++) {
      req.attach('images', FAKE_JPEG, { filename: `photo${i}.jpg`, contentType: 'image/jpeg' });
    }
    const res = await req;
    expect([400, 422]).toContain(res.status);
  });

  it('POST PDF file → 422 (MIME type check)', async () => {
    const owner = await env.provisionUser(['CREATE comments']);
    const { commentId } = await seedCommentFixture(owner.userId);

    const res = await request(env.httpServer)
      .post(`/api/comments/${commentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_PDF, { filename: 'doc.pdf', contentType: 'application/pdf' })
      .expect(422);

    expect(res.status).toBe(422);
  });

  it('non-owner without CREATE comment-images permission → 403', async () => {
    const owner = await env.provisionUser(['CREATE comments']);
    const other = await env.provisionUser(['CREATE comments']);
    const { commentId } = await seedCommentFixture(owner.userId);

    await request(env.httpServer)
      .post(`/api/comments/${commentId}/images`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(403);
  });

  it('POST unauthenticated → 401', async () => {
    const owner = await env.provisionUser([]);
    const { commentId } = await seedCommentFixture(owner.userId);

    await request(env.httpServer)
      .post(`/api/comments/${commentId}/images`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(401);
  });

  // ---- DELETE /api/comments/:id/images/:imageId ----------------------------

  it('DELETE image by owner → 204, DB row gone', async () => {
    const owner = await env.provisionUser(['CREATE comments']);
    const { commentId } = await seedCommentFixture(owner.userId);

    const postRes = await request(env.httpServer)
      .post(`/api/comments/${commentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const imageId = (postRes.body as { id: string }[])[0].id;

    await request(env.httpServer)
      .delete(`/api/comments/${commentId}/images/${imageId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);

    const { rows } = await env.pg.query(
      'SELECT id FROM comment_images WHERE id = $1',
      [imageId],
    );
    expect(rows).toHaveLength(0);
  });

  it('DELETE with wrong comment ID → 404', async () => {
    const owner = await env.provisionUser(['CREATE comments']);
    const { commentId } = await seedCommentFixture(owner.userId);

    const postRes = await request(env.httpServer)
      .post(`/api/comments/${commentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const imageId = (postRes.body as { id: string }[])[0].id;
    const wrongCommentId = randomUUID();

    await request(env.httpServer)
      .delete(`/api/comments/${wrongCommentId}/images/${imageId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });

  it('DELETE by non-owner without DELETE comment-images permission → 403', async () => {
    const owner = await env.provisionUser(['CREATE comments']);
    const other = await env.provisionUser([]);
    const { commentId } = await seedCommentFixture(owner.userId);

    const postRes = await request(env.httpServer)
      .post(`/api/comments/${commentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const imageId = (postRes.body as { id: string }[])[0].id;

    await request(env.httpServer)
      .delete(`/api/comments/${commentId}/images/${imageId}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(403);
  });
});
