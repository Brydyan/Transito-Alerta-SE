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

  it('ANON: anonymous device_uuid is rejected at login with 401 ANONYMOUS_IDENTITY_CLOSED', async () => {
    // Inversión del round 0 ("anonymous login returns tokens
    // and the four-permission reporter ceiling"). El reporte
    // sin sesión se cerró por decisión de producto 2026-09-02
    // (ver `back/2026-09-02-anon-close-anonymous-reporting`).
    // La identidad anónima ya no concede tokens ni permisos.
    const response = await request(env.httpServer)
      .post('/api/auth/login')
      .send({ device_uuid: 'anonymous' })
      .expect(401);

    // La forma del body es la del proyecto: NestJS serializa
    // el objeto pasado a UnauthorizedException como
    // { code, message } — `statusCode` lo agrega el filtro
    // HTTP al responder, no está en el body crudo.
    expect(response.body).toMatchObject({
      code: 'ANONYMOUS_IDENTITY_CLOSED',
      message: expect.stringContaining('Registrate primero para reportar'),
    });
    expect(response.status).toBe(401);
    // Sin tokens, sin permisos concedidos.
    expect(response.body.access_token).toBeUndefined();
    expect(response.body.refresh_token).toBeUndefined();
    expect(response.body.permissions).toBeUndefined();
  });
});
