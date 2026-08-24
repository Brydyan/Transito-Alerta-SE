import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

// Minimal JPEG header (SOI + APP0 marker) — recognized by most MIME sniffers.
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const FAKE_PDF = Buffer.from('%PDF-1.4\n%EOF');

/**
 * T6.6.D3 — incident images e2e.
 * Mirrors comment-images.e2e-spec.ts pattern.
 */
describe('E2E incident images (T6.6)', () => {
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

  /** Seed an incident in the DB; returns incidentId. */
  async function seedIncident(ownerId: string): Promise<string> {
    const { rows } = await env.pg.query<{ id: string }>(
      `INSERT INTO incidents (id, title, location, status, priority, citizen_id)
       VALUES ($1, 'Test incident', ST_SetSRID(ST_MakePoint(-80.5, -2.2), 4326), 'pending', 'medium', $2)
       RETURNING id`,
      [randomUUID(), ownerId],
    );
    return rows[0].id;
  }

  // ---- POST /api/incidents/:id/images ---------------------------------------

  it('POST 2 JPEG files by owner → 201 + 2 items in response + 2 rows in incident_images', async () => {
    const owner = await env.provisionUser([]);
    const incidentId = await seedIncident(owner.userId);

    const res = await request(env.httpServer)
      .post(`/api/incidents/${incidentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo1.jpg', contentType: 'image/jpeg' })
      .attach('images', FAKE_JPEG, { filename: 'photo2.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const body = res.body as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    const { rows } = await env.pg.query(
      'SELECT id FROM incident_images WHERE incident_id = $1',
      [incidentId],
    );
    expect(rows).toHaveLength(2);
  });

  it('POST PDF file → 422 (MIME type rejected)', async () => {
    const owner = await env.provisionUser([]);
    const incidentId = await seedIncident(owner.userId);

    await request(env.httpServer)
      .post(`/api/incidents/${incidentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_PDF, { filename: 'doc.pdf', contentType: 'application/pdf' })
      .expect(422);
  });

  it('POST 6 files → 400/422 (Multer count limit)', async () => {
    const owner = await env.provisionUser([]);
    const incidentId = await seedIncident(owner.userId);

    const req = request(env.httpServer)
      .post(`/api/incidents/${incidentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    for (let i = 0; i < 6; i++) {
      req.attach('images', FAKE_JPEG, { filename: `photo${i}.jpg`, contentType: 'image/jpeg' });
    }
    const res = await req;
    expect([400, 422]).toContain(res.status);
  });

  it('non-owner without CREATE incident-images permission → 403', async () => {
    const owner = await env.provisionUser([]);
    const other = await env.provisionUser([]); // no permissions at all
    const incidentId = await seedIncident(owner.userId);

    await request(env.httpServer)
      .post(`/api/incidents/${incidentId}/images`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(403);
  });

  it('POST unauthenticated → 401', async () => {
    const owner = await env.provisionUser([]);
    const incidentId = await seedIncident(owner.userId);

    await request(env.httpServer)
      .post(`/api/incidents/${incidentId}/images`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(401);
  });

  it('POST to non-existent incident → 404', async () => {
    const owner = await env.provisionUser([]);
    const fakeId = randomUUID();

    await request(env.httpServer)
      .post(`/api/incidents/${fakeId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(404);
  });

  // ---- DELETE /api/incidents/:id/images/:imageId ----------------------------

  it('DELETE image by owner → 204 + DB row gone', async () => {
    const owner = await env.provisionUser([]);
    const incidentId = await seedIncident(owner.userId);

    const postRes = await request(env.httpServer)
      .post(`/api/incidents/${incidentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const imageId = (postRes.body as { id: string }[])[0].id;

    await request(env.httpServer)
      .delete(`/api/incidents/${incidentId}/images/${imageId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);

    const { rows } = await env.pg.query(
      'SELECT id FROM incident_images WHERE id = $1',
      [imageId],
    );
    expect(rows).toHaveLength(0);
  });

  it('DELETE with wrong incidentId → 404', async () => {
    const owner = await env.provisionUser([]);
    const incidentId = await seedIncident(owner.userId);

    const postRes = await request(env.httpServer)
      .post(`/api/incidents/${incidentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const imageId = (postRes.body as { id: string }[])[0].id;
    const wrongIncidentId = randomUUID();

    await request(env.httpServer)
      .delete(`/api/incidents/${wrongIncidentId}/images/${imageId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });

  it('DELETE by non-owner without DELETE incident-images permission → 403', async () => {
    const owner = await env.provisionUser([]);
    const other = await env.provisionUser([]);
    const incidentId = await seedIncident(owner.userId);

    const postRes = await request(env.httpServer)
      .post(`/api/incidents/${incidentId}/images`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('images', FAKE_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const imageId = (postRes.body as { id: string }[])[0].id;

    await request(env.httpServer)
      .delete(`/api/incidents/${incidentId}/images/${imageId}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(403);
  });
});
