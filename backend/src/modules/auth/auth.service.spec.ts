import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService, PERMISSION_CACHE_PREFIX } from './auth.service';
import { UserEntity } from '../../entities/user.entity';

function makeAuthConfig() {
  return {
    jwtAccessSecret: 'access-secret',
    jwtRefreshSecret: 'refresh-secret',
    jwtAccessExpiresIn: '15m',
    jwtRefreshExpiresIn: '7d',
    permissionCacheTtlSeconds: 3600,
    anonymousDeviceUuid: 'anonymous',
    anonymousPermissions: ['READ incidents', 'CREATE incidents', 'CREATE comments'],
  };
}

describe('AuthService', () => {
  let userRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let configService: ConfigService;
  let service: AuthService;

  beforeEach(() => {
    userRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    jwtService = { sign: jest.fn(), verify: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn() };
    configService = { get: () => makeAuthConfig() } as unknown as ConfigService;
    service = new AuthService(
      userRepo as any,
      jwtService as unknown as JwtService,
      cache as any,
      configService,
    );
  });

  describe('login', () => {
    it('rejects an empty/blank device_uuid with 401 Unauthorized', async () => {
      await expect(service.login('')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('creates a new user row and issues access+refresh tokens for a first-time device_uuid', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const created: Partial<UserEntity> = { id: 'user-1', deviceUuid: 'device-abc', permissions: [] };
      userRepo.create.mockReturnValue(created);
      userRepo.save.mockResolvedValue(created);
      cache.get.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('access.jwt.token').mockReturnValueOnce('refresh.jwt.token');

      const result = await service.login('device-abc');

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ deviceUuid: 'device-abc' }),
      );
      expect(result.access_token).toBe('access.jwt.token');
      expect(result.refresh_token).toBe('refresh.jwt.token');
    });

    it('grants the anonymous permission ceiling for device_uuid="anonymous" (triangulation)', async () => {
      const anonUser: Partial<UserEntity> = { id: 'anon-id', deviceUuid: 'anonymous', permissions: [] };
      userRepo.findOne.mockResolvedValue(anonUser);
      cache.get.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('access2').mockReturnValueOnce('refresh2');

      const result = await service.login('anonymous');

      expect(result.permissions).toEqual([
        'READ incidents',
        'CREATE incidents',
        'CREATE comments',
      ]);
    });
  });

  describe('refresh', () => {
    it('issues a NEW access token when the refresh token is valid', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', typ: 'refresh', jti: 'abc' });
      userRepo.findOne.mockResolvedValue({ id: 'user-1', deviceUuid: 'device-abc', permissions: [] });
      jwtService.sign.mockReturnValue('new.access.token');

      const result = await service.refresh('valid.refresh.token');

      expect(result.access_token).toBe('new.access.token');
      expect(jwtService.verify).toHaveBeenCalledWith('valid.refresh.token', {
        secret: 'refresh-secret',
      });
    });

    it('rejects an invalid/expired refresh token with 401 Unauthorized', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refresh('bad.token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('validateToken', () => {
    it('returns the decoded payload for a valid access token', () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', typ: 'access', jti: 'x' });

      const payload = service.validateToken('valid.access.token');

      expect(payload.sub).toBe('user-1');
    });

    it('throws 401 Unauthorized for an invalid access token', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      expect(() => service.validateToken('garbage')).toThrow(UnauthorizedException);
    });
  });

  describe('getPermissions', () => {
    it('returns the cached permission set on a Redis cache hit (no DB rebuild)', async () => {
      cache.get.mockResolvedValue(['READ incidents']);

      const result = await service.getPermissions('device-abc');

      expect(result).toEqual(['READ incidents']);
      expect(cache.get).toHaveBeenCalledWith(`${PERMISSION_CACHE_PREFIX}device-abc`);
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });

    it('rebuilds from the DB and re-populates the cache on a miss', async () => {
      cache.get.mockResolvedValue(undefined);
      userRepo.findOne.mockResolvedValue({
        id: 'user-2',
        deviceUuid: 'device-xyz',
        permissions: ['UPDATE incidents'],
      });

      const result = await service.getPermissions('device-xyz');

      expect(result).toEqual(['UPDATE incidents']);
      expect(cache.set).toHaveBeenCalledWith(
        `${PERMISSION_CACHE_PREFIX}device-xyz`,
        ['UPDATE incidents'],
        3600 * 1000,
      );
    });
  });
});
