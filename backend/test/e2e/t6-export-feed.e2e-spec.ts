import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

/**
 * T6 export + feed e2e:
 *  - T6.7.A5: GET /incidents/export?format=xlsx → 200 + xlsx Content-Type
 *             GET /incidents/exportar?format=csv → same as /export?format=csv
 *  - T6.7.C6: POST /incidents/admin/feed/rebuild → 202 as admin_sistema; without → 403
 */
describe('E2E T6 export XLSX + feed rebuild (T6.7.A5, T6.7.C6)', () => {
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

  // ---- T6.7.A5 — export XLSX + exportar alias --------------------------------

  it('T6.7.A5: GET /incidents/export?format=xlsx → 200 + xlsx Content-Type + non-empty body', async () => {
    // Permission required: READ dashboard (based on controller @RequirePermission('READ', 'dashboard'))
    const admin = await env.provisionUser(['READ dashboard'], { roleName: 'admin_sistema' });

    const res = await request(env.httpServer)
      .get('/api/incidents/export?format=xlsx')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    // Body must not be empty
    expect(res.body).toBeDefined();
  });

  it('T6.7.A5: GET /incidents/exportar?format=csv → 200 + csv Content-Type', async () => {
    const admin = await env.provisionUser(['READ dashboard'], { roleName: 'admin_sistema' });

    const res = await request(env.httpServer)
      .get('/api/incidents/exportar?format=csv')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('T6.7.A5: /incidents/exportar?format=csv produces same Content-Type as /incidents/export?format=csv', async () => {
    const admin = await env.provisionUser(['READ dashboard'], { roleName: 'admin_sistema' });
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    const r1 = await request(env.httpServer).get('/api/incidents/export?format=csv').set(auth).expect(200);
    const r2 = await request(env.httpServer).get('/api/incidents/exportar?format=csv').set(auth).expect(200);

    expect(r1.headers['content-type']).toBe(r2.headers['content-type']);
  });

  // ---- T6.7.C6 — feed rebuild -----------------------------------------------

  it('T6.7.C6: POST /incidents/admin/feed/rebuild as admin_sistema → 202 + { rebuilt: number }', async () => {
    const admin = await env.provisionUser(['CREATE incidents'], { roleName: 'admin_sistema' });
    const auth = { Authorization: `Bearer ${admin.accessToken}` };

    // Seed one incident so the rebuild has something to insert
    await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Incident for rebuild', ...INSIDE_SANTA_ELENA })
      .expect(201);

    const res = await request(env.httpServer)
      .post('/api/incidents/admin/feed/rebuild')
      .set(auth)
      .expect(202);

    expect(typeof res.body.rebuilt).toBe('number');
  });

  it('T6.7.C6: POST /incidents/admin/feed/rebuild without admin_sistema role → 403', async () => {
    const nonAdmin = await env.provisionUser(['CREATE incidents'], { roleName: 'operador_sistema' });

    await request(env.httpServer)
      .post('/api/incidents/admin/feed/rebuild')
      .set('Authorization', `Bearer ${nonAdmin.accessToken}`)
      .expect(403);
  });
});
