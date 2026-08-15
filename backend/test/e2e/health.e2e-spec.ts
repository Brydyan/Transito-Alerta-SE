import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

/**
 * Harness smoke test (T4.1a) — proves the whole stack boots against real
 * infrastructure end to end: Postgres+PostGIS built from the numbered
 * migrations (not `synchronize`), real Redis, and the Nest app wired
 * exactly like main.ts. The four full workflow scenarios (anonymous
 * report, WS-verified assign, comment+status+audit, notification delivery)
 * land in the next batch — this file only proves the harness itself works.
 */
describe('E2E harness smoke test', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  it('GET /api/health returns 200 with an ok status', async () => {
    const response = await request(env.httpServer).get('/api/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('anonymous login returns tokens and the four-permission reporter ceiling', async () => {
    const response = await request(env.httpServer)
      .post('/api/auth/login')
      .send({ device_uuid: 'anonymous' })
      .expect(200);

    expect(typeof response.body.access_token).toBe('string');
    expect(typeof response.body.refresh_token).toBe('string');
    expect(response.body.permissions).toEqual([
      'READ incidents',
      'CREATE incidents',
      'READ comments',
      'CREATE comments',
    ]);
  });
});
