import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RevocationCache } from '../sessions/revocation-cache';

function makeConfigService(): ConfigService {
  return {
    get: () => ({
      jwtAccessSecret: 'access-secret',
      jwtRefreshSecret: 'refresh-secret',
      jwtAccessExpiresIn: '15m',
      jwtRefreshExpiresIn: '7d',
      permissionCacheTtlSeconds: 3600,
      anonymousDeviceUuid: 'anonymous',
      anonymousPermissions: [],
    }),
  } as unknown as ConfigService;
}

const AUTHENTICATED_CTX = {
  userId: 'user-1',
  permissions: ['READ incidents'],
  organizationId: 'org-1',
  roleName: 'admin_org',
  scope: { kind: 'org' as const, organizationId: 'org-1' },
  sessionId: null,
  isAnonymous: false,
};

const ANONYMOUS_CTX = {
  userId: 'anon-1',
  permissions: [],
  organizationId: null,
  roleName: null,
  scope: { kind: 'public' as const },
  sessionId: null,
  isAnonymous: true,
};

describe('JwtStrategy', () => {
  let authService: { getAuthContextByUserId: jest.Mock };
  let revocationCache: { isRevoked: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    authService = { getAuthContextByUserId: jest.fn() };
    revocationCache = { isRevoked: jest.fn() };
    strategy = new JwtStrategy(
      makeConfigService(),
      authService as unknown as AuthService,
      revocationCache as unknown as RevocationCache,
    );
  });

  it('rejects a refresh token presented as an access token', async () => {
    await expect(
      strategy.validate({ sub: 'user-1', typ: 'refresh', jti: 'x', pv: 1 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the full AuthContext (organizationId/roleName/scope) as req.user, not a partial shape', async () => {
    authService.getAuthContextByUserId.mockResolvedValue(AUTHENTICATED_CTX);
    revocationCache.isRevoked.mockResolvedValue(false);

    const result = await strategy.validate({
      sub: 'user-1',
      typ: 'access',
      jti: 'x',
      pv: 1,
      sid: 'sid-1',
    });

    expect(authService.getAuthContextByUserId).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ ...AUTHENTICATED_CTX, sessionId: 'sid-1' });
  });

  describe('T3.9 design §3 — sid requirement + denylist check', () => {
    it('401s with SESSION_REQUIRED when a non-anonymous token carries no sid (D7 legacy-token branch)', async () => {
      authService.getAuthContextByUserId.mockResolvedValue(AUTHENTICATED_CTX);

      try {
        await strategy.validate({ sub: 'user-1', typ: 'access', jti: 'x', pv: 1 });
        fail('expected UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect((err as UnauthorizedException).getResponse()).toMatchObject({
          code: 'SESSION_REQUIRED',
        });
      }
      expect(revocationCache.isRevoked).not.toHaveBeenCalled();
    });

    it('401s with SESSION_REVOKED on a denylist hit', async () => {
      authService.getAuthContextByUserId.mockResolvedValue(AUTHENTICATED_CTX);
      revocationCache.isRevoked.mockResolvedValue(true);

      try {
        await strategy.validate({ sub: 'user-1', typ: 'access', jti: 'x', pv: 1, sid: 'sid-1' });
        fail('expected UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect((err as UnauthorizedException).getResponse()).toMatchObject({
          code: 'SESSION_REVOKED',
        });
      }
      expect(revocationCache.isRevoked).toHaveBeenCalledWith('sid-1');
    });

    it('attaches sessionId from the payload sid onto the returned AuthContext', async () => {
      authService.getAuthContextByUserId.mockResolvedValue(AUTHENTICATED_CTX);
      revocationCache.isRevoked.mockResolvedValue(false);

      const result = await strategy.validate({
        sub: 'user-1',
        typ: 'access',
        jti: 'x',
        pv: 1,
        sid: 'sid-1',
      });

      expect(result.sessionId).toBe('sid-1');
    });

    it('an anonymous identity skips the sid/denylist check entirely (D8)', async () => {
      authService.getAuthContextByUserId.mockResolvedValue(ANONYMOUS_CTX);

      const result = await strategy.validate({ sub: 'anon-1', typ: 'access', jti: 'x', pv: 1 });

      expect(revocationCache.isRevoked).not.toHaveBeenCalled();
      expect(result).toEqual(ANONYMOUS_CTX);
    });
  });
});
