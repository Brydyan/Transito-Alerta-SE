import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

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

describe('JwtStrategy', () => {
  let authService: { getAuthContextByUserId: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    authService = { getAuthContextByUserId: jest.fn() };
    strategy = new JwtStrategy(makeConfigService(), authService as unknown as AuthService);
  });

  it('rejects a refresh token presented as an access token', async () => {
    await expect(
      strategy.validate({ sub: 'user-1', typ: 'refresh', jti: 'x', pv: 1 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the full AuthContext (organizationId/roleName/scope) as req.user, not a partial shape', async () => {
    const ctx = {
      userId: 'user-1',
      permissions: ['READ incidents'],
      organizationId: 'org-1',
      roleName: 'admin_organizacion',
      scope: { kind: 'org', organizationId: 'org-1' },
    };
    authService.getAuthContextByUserId.mockResolvedValue(ctx);

    const result = await strategy.validate({ sub: 'user-1', typ: 'access', jti: 'x', pv: 1 });

    expect(authService.getAuthContextByUserId).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(ctx);
  });
});
