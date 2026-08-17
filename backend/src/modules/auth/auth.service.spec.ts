import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import type { DataSource, Repository } from 'typeorm';
import { AuthService, PERMISSION_CACHE_PREFIX } from './auth.service';
import { UserEntity } from '../../entities/user.entity';

function makeDataSource(overrides: { query?: jest.Mock } = {}) {
  return { query: overrides.query ?? jest.fn().mockResolvedValue([]) };
}

function makeAuthConfig() {
  return {
    jwtAccessSecret: 'access-secret',
    jwtRefreshSecret: 'refresh-secret',
    jwtAccessExpiresIn: '15m',
    jwtRefreshExpiresIn: '7d',
    permissionCacheTtlSeconds: 3600,
    anonymousDeviceUuid: 'anonymous',
    anonymousPermissions: [
      'READ incidents',
      'CREATE incidents',
      'READ comments',
      'CREATE comments',
    ],
  };
}

describe('AuthService', () => {
  let userRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let configService: ConfigService;
  let eventEmitter: { emit: jest.Mock };
  let dataSource: { query: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    userRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    jwtService = { sign: jest.fn(), verify: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn() };
    configService = { get: () => makeAuthConfig() } as unknown as ConfigService;
    eventEmitter = { emit: jest.fn() };
    dataSource = makeDataSource();
    service = new AuthService(
      userRepo as unknown as jest.Mocked<Repository<UserEntity>>,
      jwtService as unknown as JwtService,
      cache as unknown as jest.Mocked<Cache>,
      configService,
      eventEmitter as unknown as jest.Mocked<EventEmitter2>,
      dataSource as unknown as DataSource,
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

    it('emits auth.login so UsersService can record a session-tracking row (R4)', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1', deviceUuid: 'device-abc', permissions: [] });
      cache.get.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('a').mockReturnValueOnce('r');

      await service.login('device-abc');

      expect(eventEmitter.emit).toHaveBeenCalledWith('auth.login', {
        userId: 'user-1',
        deviceUuid: 'device-abc',
      });
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
        'READ comments',
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

describe('AuthService.invalidatePermissionCache', () => {
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    service = new AuthService(
      {} as unknown as jest.Mocked<Repository<UserEntity>>,
      { sign: jest.fn(), verify: jest.fn() } as unknown as JwtService,
      cache as unknown as jest.Mocked<Cache>,
      { get: () => makeAuthConfig() } as unknown as ConfigService,
      { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>,
      makeDataSource() as unknown as DataSource,
    );
  });

  // RolesService.assignRole (T3.1, design D2) must purge BOTH cache
  // schemas — device_uuid-keyed (getPermissions) and uid-keyed
  // (getPermissionsByUserId, what JwtStrategy actually calls per request)
  // — or a reassignment would only ever appear to take effect.
  it('deletes both the device_uuid-keyed and uid-keyed cache entries', async () => {
    await service.invalidatePermissionCache('user-1', 'device-abc');

    expect(cache.del).toHaveBeenCalledWith(`${PERMISSION_CACHE_PREFIX}device-abc`);
    expect(cache.del).toHaveBeenCalledWith(`${PERMISSION_CACHE_PREFIX}uid:user-1`);
  });
});

describe('AuthService.getAuthContextByUserId (T3.2 D6)', () => {
  let cache: { get: jest.Mock; set: jest.Mock };
  let dataSource: { query: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    cache = { get: jest.fn(), set: jest.fn() };
    dataSource = makeDataSource();
    service = new AuthService(
      {} as unknown as jest.Mocked<Repository<UserEntity>>,
      { sign: jest.fn(), verify: jest.fn() } as unknown as JwtService,
      cache as unknown as jest.Mocked<Cache>,
      { get: () => makeAuthConfig() } as unknown as ConfigService,
      { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>,
      dataSource as unknown as DataSource,
    );
  });

  it('resolves the full AuthContext from a single joined query on a cache miss', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      {
        permissions: ['READ incidents', 'UPDATE incidents'],
        organization_id: 'org-1',
        device_uuid: 'device-abc',
        role_name: 'admin_organizacion',
      },
    ]);

    const ctx = await service.getAuthContextByUserId('user-1');

    expect(ctx).toEqual({
      userId: 'user-1',
      permissions: ['READ incidents', 'UPDATE incidents'],
      organizationId: 'org-1',
      roleName: 'admin_organizacion',
      scope: { kind: 'org', organizationId: 'org-1' },
    });
  });

  it('caches under the perm:v2:uid: prefix (distinct from the legacy perm: shape)', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      { permissions: ['READ incidents'], organization_id: null, device_uuid: 'device-abc', role_name: null },
    ]);

    await service.getAuthContextByUserId('user-1');

    expect(cache.set).toHaveBeenCalledWith(
      `${PERMISSION_CACHE_PREFIX}uid:user-1`,
      { permissions: ['READ incidents'], organizationId: null, roleName: null },
      expect.any(Number),
    );
  });

  it('serves a cached AuthContext without hitting the database (cache hit)', async () => {
    cache.get.mockResolvedValue({
      permissions: ['READ incidents'],
      organizationId: 'org-1',
      roleName: 'admin_organizacion',
    });

    const ctx = await service.getAuthContextByUserId('user-1');

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(ctx).toEqual({
      userId: 'user-1',
      permissions: ['READ incidents'],
      organizationId: 'org-1',
      roleName: 'admin_organizacion',
      scope: { kind: 'org', organizationId: 'org-1' },
    });
  });

  // The anonymous branch cannot short-circuit BEFORE the query on the uid
  // path (design "Correction to the proposal's wording") — userId alone
  // does not reveal the device. device_uuid is loaded, THEN checked.
  it('anonymous device_uuid forces the anonymous ceiling and public scope', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      {
        permissions: ['UPDATE incidents'], // ignored for anonymous — DB row's own permissions never apply
        organization_id: null,
        device_uuid: 'anonymous',
        role_name: null,
      },
    ]);

    const ctx = await service.getAuthContextByUserId('anon-row-id');

    expect(ctx.permissions).toEqual([
      'READ incidents',
      'CREATE incidents',
      'READ comments',
      'CREATE comments',
    ]);
    expect(ctx.organizationId).toBeNull();
    expect(ctx.roleName).toBeNull();
    expect(ctx.scope).toEqual({ kind: 'public' });
  });

  it('returns a public-scoped empty context for an unknown user id, uncached', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([]);

    const ctx = await service.getAuthContextByUserId('ghost');

    expect(ctx.permissions).toEqual([]);
    expect(ctx.scope).toEqual({ kind: 'public' });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('operador_sistema resolves to global scope (explicit branch, not fallthrough)', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      { permissions: ['READ incidents'], organization_id: null, device_uuid: 'device-x', role_name: 'operador_sistema' },
    ]);

    const ctx = await service.getAuthContextByUserId('user-2');

    expect(ctx.scope).toEqual({ kind: 'global' });
  });
});

describe('AuthService.getPermissionsByUserId (delegates to getAuthContextByUserId)', () => {
  let cache: { get: jest.Mock; set: jest.Mock };
  let dataSource: { query: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    cache = { get: jest.fn(), set: jest.fn() };
    dataSource = makeDataSource();
    service = new AuthService(
      {} as unknown as jest.Mocked<Repository<UserEntity>>,
      { sign: jest.fn(), verify: jest.fn() } as unknown as JwtService,
      cache as unknown as jest.Mocked<Cache>,
      { get: () => makeAuthConfig() } as unknown as ConfigService,
      { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>,
      dataSource as unknown as DataSource,
    );
  });

  // JwtStrategy passes the JWT `sub` claim, which is user.id — NOT device_uuid.
  it('resolves permissions from a user id, not a device_uuid', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      {
        permissions: ['READ incidents', 'UPDATE incidents'],
        organization_id: null,
        device_uuid: 'device-abc',
        role_name: null,
      },
    ]);

    const permissions = await service.getPermissionsByUserId('user-1');

    expect(permissions).toEqual(['READ incidents', 'UPDATE incidents']);
  });

  it('grants the anonymous ceiling when the id resolves to the anonymous device', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      { permissions: [], organization_id: null, device_uuid: 'anonymous', role_name: null },
    ]);

    const permissions = await service.getPermissionsByUserId('anon-row-id');

    expect(permissions).toEqual([
      'READ incidents',
      'CREATE incidents',
      'READ comments',
      'CREATE comments',
    ]);
  });

  it('returns no permissions for an unknown user id', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([]);

    await expect(service.getPermissionsByUserId('ghost')).resolves.toEqual([]);
  });

  // Caching a miss would pin an unknown user to [] for the whole TTL, so a
  // freshly-provisioned account would keep 403ing until the entry expired.
  it('does not cache the empty result for an unknown user id', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([]);

    await service.getPermissionsByUserId('ghost');

    expect(cache.set).not.toHaveBeenCalled();
  });

  it('serves a cached permission set without hitting the database', async () => {
    cache.get.mockResolvedValue({
      permissions: ['READ incidents'],
      organizationId: null,
      roleName: null,
    });

    const permissions = await service.getPermissionsByUserId('user-1');

    expect(permissions).toEqual(['READ incidents']);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('keys the cache by user id, distinct from the device_uuid key', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      { permissions: ['READ incidents'], organization_id: null, device_uuid: 'device-abc', role_name: null },
    ]);

    await service.getPermissionsByUserId('user-1');

    expect(cache.set).toHaveBeenCalledWith(
      `${PERMISSION_CACHE_PREFIX}uid:user-1`,
      expect.objectContaining({ permissions: ['READ incidents'] }),
      expect.any(Number),
    );
  });
});
