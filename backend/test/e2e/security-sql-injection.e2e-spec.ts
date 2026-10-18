import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';

/**
 * Security — SQL Injection (E2E) — P9 del
 * MINIMAX_BUILDER_SECURITY_IMPLEMENTATION.md.
 *
 * Defense-in-depth: TypeORM parametriza queries por default; este test
 * verifica que el surface HTTP completo (controllers + validators + DB
 * layer) cierra el camino para 5 vectores clásicos de SQLi en los
 * endpoints que aceptan string del usuario. Cualquier vector que
 * produzca un 500 (server error sin manejar) es señal de query mal
 * parametrizada — fix inmediato antes de merge.
 *
 * Convenciones del repo: usa TestEnvironment (testcontainers real
 * Postgres/Redis, no mocks) para que el test ejercite el SQL real, no
 * un mock que pasaría cualquier vector. Adaptado del template del
 * MINIMAX_BUILDER_SECURITY_IMPLEMENTATION.md al patrón
 * TestEnvironment.provisionUser (admin master) + env.httpServer.
 *
 * Endpoint `/api/incidents/search` del template NO existe en el repo;
 * sustituido por `/api/incidents?status=X` (el único GET que acepta
 * string del usuario vía query).
 */
describe('Security: SQL Injection (E2E)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  beforeEach(async () => {
    // Defense-in-depth: limpia Redis cache (incluye buckets de rate
    // limit) entre tests. El test-environment setea
    // RATE_LIMIT_STRICT_MAX_REQUESTS=100000, pero si una spec anterior
    // del shard consumió budget, este reset previene contaminaciones.
    await env.reset();
  });

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  const SQL_INJECTION_VECTORS = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' UNION SELECT NULL, NULL, NULL--",
    "admin'--",
    '1 OR 1=1',
  ];

  describe.each(SQL_INJECTION_VECTORS)('Vector: %s', (vector) => {
    it('POST /auth/login rechaza el payload (no emite token)', async () => {
      const res = await request(env.httpServer)
        .post('/api/auth/login')
        .send({
          email: `${vector}@test.com`,
          password: vector,
        });

      // 401 (auth falla porque el user no existe) o 400 (ValidationPipe
      // rechaza) — NUNCA 500 (query mal parametrizada) ni 200 (login
      // exitoso).
      expect([400, 401]).toContain(res.status);
      expect(res.body).not.toHaveProperty('access_token');
    });

    it('GET /api/incidents?status=X no rompe con vector SQLi', async () => {
      const admin = await env.provisionUser(['READ incidents'], { roleName: 'master' });
      const res = await request(env.httpServer)
        .get('/api/incidents')
        .query({ status: vector })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      // 200 (lista vacía o filtrada) o 400 (validation rechaza el
      // formato). NUNCA 500.
      expect([200, 400]).toContain(res.status);
    });

    it('GET /api/users?role=X no rompe con vector SQLi', async () => {
      const admin = await env.provisionUser(['READ users'], { roleName: 'master' });
      const res = await request(env.httpServer)
        .get('/api/users')
        .query({ role: vector })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      // 200 (lista vacía o filtrada) o 400 (validation rechaza). NUNCA 500.
      expect([200, 400]).toContain(res.status);
    });
  });
});