import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

// Minimal valid 1×1 white JPEG produced by sharp (F7 — WebP compression now runs
// on every upload; a truncated header stub is rejected by sharp as corrupt input).
const FAKE_JPEG = Buffer.from([255,216,255,219,0,67,0,6,4,5,6,5,4,6,6,5,6,7,7,6,8,10,16,10,10,9,9,10,20,14,15,12,16,23,20,24,24,23,20,22,22,26,29,37,31,26,27,35,28,22,22,32,44,32,35,38,39,41,42,41,25,31,45,48,45,40,48,37,40,41,40,255,219,0,67,1,7,7,7,10,8,10,19,10,10,19,40,26,22,26,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,255,192,0,17,8,0,1,0,1,3,1,34,0,2,17,1,3,17,1,255,196,0,21,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,255,196,0,20,16,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,196,0,20,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,196,0,20,17,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,218,0,12,3,1,0,2,17,3,17,0,63,0,170,64,7,255,217]);
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
