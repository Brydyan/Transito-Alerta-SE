import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';

/**
 * Security — JWT Tampering (E2E) — P10 del
 * MINIMAX_BUILDER_SECURITY_IMPLEMENTATION.md.
 *
 * Verifica que JwtStrategy rechaza todo intento de forging/tampering de
 * tokens. Defense-in-depth sobre la verificación de passport-jwt:
 * alg=none, secret incorrecto, typ incorrecto, token expirado.
 *
 * Convenciones del repo: TestEnvironment (testcontainers real
 * Postgres/Redis). El secret se lee del config que el env levanta
 * (default 'dev-access-secret-change-me' si no se sobreescribe via
 * JWT_ACCESS_SECRET — consistente con el default en
 * config/auth.config.ts).
 *
 * Para firmar tokens usamos el JwtService de @nestjs/jwt (ya en
 * deps de producción) — usa el mismo `jsonwebtoken` subyacente pero
 * vía la API wrapper, así no necesitamos importar la lib transitive
 * directa (que pnpm aísla).
 *
 * Endpoint target: /api/users/me (autenticado, devuelve 401 sin
 * token válido, 200 con uno).
 */
describe('Security: JWT Tampering (E2E)', () => {
  let env: TestEnvironment;
  // JwtService con el secret del refresh path. Los tokens access
  // expirados y con secret incorrecto usan sus propias instancias
  // (cada test fija su propio secret/expiresIn).
  const refreshJwt = new JwtService({
    secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    signOptions: { expiresIn: '7d' },
  });

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  describe('Token validation', () => {
    it('rechaza token con alg=none', async () => {
      // JwtService no expone alg=none (no es seguro). Usamos la lib
      // transitiva vía require para forzar un token sin firma.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const jwt = require('jsonwebtoken');
      const noneAlg = jwt.sign({ sub: 'u-test', typ: 'access' }, '', {
        algorithm: 'none',
      });

      const res = await request(env.httpServer)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${noneAlg}`);

      expect(res.status).toBe(401);
    });

    it('rechaza token firmado con secret incorrecto', async () => {
      const wrongSecret = new JwtService({
        secret: 'wrong-secret-123',
        signOptions: { expiresIn: '15m' },
      });
      const forged = wrongSecret.sign({ sub: 'u-test', typ: 'access' });

      const res = await request(env.httpServer)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${forged}`);

      expect(res.status).toBe(401);
    });

    it('rechaza refresh token usado como access token (typ=refresh)', async () => {
      const refreshToken = refreshJwt.sign({ sub: 'u-test', typ: 'refresh' });

      const res = await request(env.httpServer)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${refreshToken}`);

      expect(res.status).toBe(401);
    });

    it('rechaza access token expirado', async () => {
      // JwtService con expiresIn negativo produce un token ya expirado.
      const expiredJwt = new JwtService({
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
        signOptions: { expiresIn: '-60s' },
      });
      const expired = expiredJwt.sign({ sub: 'u-test', typ: 'access' });

      const res = await request(env.httpServer)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${expired}`);

      expect(res.status).toBe(401);
    });
  });
});