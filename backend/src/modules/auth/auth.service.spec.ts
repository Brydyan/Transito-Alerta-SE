import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import type { DataSource, Repository } from 'typeorm';
import { AuthService, PERMISSION_CACHE_PREFIX } from './auth.service';
import { UserEntity } from '../../entities/user.entity';
import { GraceBuffer } from '../sessions/grace-buffer';
import { RevocationCache } from '../sessions/revocation-cache';
import { SessionsRepository } from '../sessions/sessions.repository';

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
    // ANON (sc-327) — la lista está vacía. El reporte sin sesión
    // se cerró. Si la mock no se actualizara, los tests que pasan
    // por la rama "anonymous device" verían un techo obsoleto y
    // falsearían verde la rama crítica.
    anonymousPermissions: [],
    sessionRefreshGraceSeconds: 30,
    sessionRefreshTtlSeconds: 604800,
  };
}

function makeSessionsRepository() {
  return {
    create: jest.fn(),
    findActiveById: jest.fn(),
    findActiveByUser: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
    existsRevoked: jest.fn(),
    findRevokedUnexpired: jest.fn(),
    findManageableTarget: jest.fn(),
  };
}

function makeRevocationCache() {
  return { isRevoked: jest.fn(), revoke: jest.fn() };
}

function makeGraceBuffer() {
  return { set: jest.fn(), get: jest.fn(), clear: jest.fn() };
}

function makeSessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sid-1',
    user_id: 'user-1',
    device_uuid: 'device-abc',
    created_at: new Date(),
    refresh_token_hash: null,
    previous_refresh_token_hash: null,
    rotated_at: null,
    ip_address: null,
    user_agent: null,
    revoked_at: null,
    last_used_at: null,
    expires_at: new Date(Date.now() + 604800_000),
    ...overrides,
  };
}

describe('AuthService', () => {
  let userRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let configService: ConfigService;
  let dataSource: { query: jest.Mock };
  let sessionsRepository: ReturnType<typeof makeSessionsRepository>;
  let revocationCache: ReturnType<typeof makeRevocationCache>;
  let graceBuffer: ReturnType<typeof makeGraceBuffer>;
  let service: AuthService;

  beforeEach(() => {
    userRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    jwtService = { sign: jest.fn(), verify: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn() };
    configService = { get: () => makeAuthConfig() } as unknown as ConfigService;
    dataSource = makeDataSource();
    sessionsRepository = makeSessionsRepository();
    revocationCache = makeRevocationCache();
    graceBuffer = makeGraceBuffer();
    service = new AuthService(
      userRepo as unknown as jest.Mocked<Repository<UserEntity>>,
      jwtService as unknown as JwtService,
      cache as unknown as jest.Mocked<Cache>,
      configService,
      dataSource as unknown as DataSource,
      sessionsRepository as unknown as SessionsRepository,
      revocationCache as unknown as RevocationCache,
      graceBuffer as unknown as GraceBuffer,
    );
  });

  describe('login (T3.9 design "Architecture Overview")', () => {
    it('rejects an empty/blank device_uuid with 401 Unauthorized', async () => {
      await expect(service.login('')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('creates a new user row, mints a sid shared by both tokens, and writes the session row synchronously', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const created: Partial<UserEntity> = { id: 'user-1', deviceUuid: 'device-abc', permissions: [] };
      userRepo.create.mockReturnValue(created);
      userRepo.save.mockResolvedValue(created);
      cache.get.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('access.jwt.token').mockReturnValueOnce('refresh.jwt.token');
      sessionsRepository.create.mockResolvedValue(makeSessionRow());

      const result = await service.login('device-abc');

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ deviceUuid: 'device-abc' }),
      );
      expect(result.access_token).toBe('access.jwt.token');
      expect(result.refresh_token).toBe('refresh.jwt.token');

      // Both signed payloads carry the identical sid.
      const accessPayload = jwtService.sign.mock.calls[0][0];
      const refreshPayload = jwtService.sign.mock.calls[1][0];
      expect(accessPayload.sid).toBeDefined();
      expect(accessPayload.sid).toBe(refreshPayload.sid);

      expect(sessionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: accessPayload.sid,
          userId: 'user-1',
          deviceUuid: 'device-abc',
          refreshTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          ttlSeconds: 604800,
        }),
      );
    });

    it('login fails when SessionsRepository.create throws (D2 — synchronous write)', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1', deviceUuid: 'device-abc', permissions: [] });
      cache.get.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('a').mockReturnValueOnce('r');
      sessionsRepository.create.mockRejectedValue(new Error('DB down'));

      await expect(service.login('device-abc')).rejects.toThrow('DB down');
    });

    // ANON (sc-327) — la identidad anónima ya no puede iniciar
    // sesión. El reporte requiere `reporter` autenticado con
    // verificación de email (REG sc-325). El login con
    // `device_uuid = 'anonymous'` se rechaza con 401
    // `ANONYMOUS_IDENTITY_CLOSED` antes de tocar la BD. La rama
    // completa de "anonymous grants" del round 0 desaparece
    // porque la capacidad se retiró a propósito.
    it('ANON: rejects device_uuid="anonymous" with 401 ANONYMOUS_IDENTITY_CLOSED (no BD, no token)', async () => {
      await expect(service.login('anonymous')).rejects.toMatchObject({
        status: 401,
        response: { code: 'ANONYMOUS_IDENTITY_CLOSED' },
      });
      // La BD NO se toca (no se busca ni se crea la fila
      // anónima — el rechazo es anterior).
      expect(userRepo.findOne).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
      // No se emite token de acceso ni de refresco.
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('ANON: device_uuid no anónimo sigue su camino habitual (no se rompe la rama de device-identity)', async () => {
      // Distinción quirúrgica del proposal §"Alcance quirúrgico":
      // la decisión cierra `device_uuid === 'anonymous'`, NO la
      // forma de credencial `{device_uuid}` ni los demás
      // dispositivos. Este test afirma que el resto del flujo
      // device-uuid no se ve afectado.
      const realDeviceUser: Partial<UserEntity> = {
        id: 'device-user',
        deviceUuid: 'device-abc',
        permissions: [],
        isActive: true,
      };
      userRepo.findOne.mockResolvedValue(realDeviceUser);
      cache.get.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('access-x').mockReturnValueOnce('refresh-x');

      const result = await service.login('device-abc');
      expect(result.access_token).toBe('access-x');
      expect(result.refresh_token).toBe('refresh-x');
    });
  });

  describe('refresh (T3.9 design §1/§7/§9 — full branch matrix)', () => {
    function verifyReturns(payload: Partial<Record<string, unknown>>) {
      jwtService.verify.mockReturnValue({ sub: 'user-1', typ: 'refresh', jti: 'x', pv: 1, ...payload });
    }

    it('rejects an invalid/expired refresh token with 401 Unauthorized', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refresh('bad.token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a non-refresh typ token', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', typ: 'access', jti: 'x', pv: 1, sid: 'sid-1' });

      await expect(service.refresh('access.jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('401s SESSION_REQUIRED when the refresh token carries no sid (D7)', async () => {
      verifyReturns({});

      try {
        await service.refresh('legacy.jwt');
        fail('expected UnauthorizedException');
      } catch (err) {
        expect((err as UnauthorizedException).getResponse()).toMatchObject({
          code: 'SESSION_REQUIRED',
        });
      }
      expect(sessionsRepository.findActiveById).not.toHaveBeenCalled();
    });

    it('401s SESSION_REVOKED when findActiveById returns null (revoked, expired, or unknown session)', async () => {
      verifyReturns({ sid: 'sid-1' });
      sessionsRepository.findActiveById.mockResolvedValue(null);

      try {
        await service.refresh('some.jwt');
        fail('expected UnauthorizedException');
      } catch (err) {
        expect((err as UnauthorizedException).getResponse()).toMatchObject({
          code: 'SESSION_REVOKED',
        });
      }
    });

    it('401s SESSION_USER_MISMATCH and does NOT revoke when session.user_id !== payload.sub ([R6])', async () => {
      verifyReturns({ sid: 'sid-1', sub: 'user-1' });
      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({ user_id: 'someone-else' }),
      );

      try {
        await service.refresh('mismatched.jwt');
        fail('expected UnauthorizedException');
      } catch (err) {
        expect((err as UnauthorizedException).getResponse()).toMatchObject({
          code: 'SESSION_USER_MISMATCH',
        });
      }
      expect(sessionsRepository.revoke).not.toHaveBeenCalled();
      expect(revocationCache.revoke).not.toHaveBeenCalled();
    });

    it('current-hash hit -> CAS called, new pair returned, permissions attached', async () => {
      verifyReturns({ sid: 'sid-1', sub: 'user-1' });
      // The presented token's hash must equal session.refresh_token_hash —
      // compute it the same way the service does.
      const presentedToken = 'presented.refresh.jwt';
      const { createHash } = jest.requireActual('crypto');
      const presentedHash = createHash('sha256').update(presentedToken, 'utf8').digest('hex');
      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({ refresh_token_hash: presentedHash, previous_refresh_token_hash: null }),
      );
      jwtService.sign.mockReturnValueOnce('new.access.jwt').mockReturnValueOnce('new.refresh.jwt');
      sessionsRepository.rotate.mockResolvedValue(makeSessionRow({ id: 'sid-1' }));
      dataSource.query.mockResolvedValue([
        { permissions: ['READ incidents'], organization_id: null, device_uuid: 'device-abc', role_name: null },
      ]);

      const result = await service.refresh(presentedToken);

      expect(sessionsRepository.rotate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sid-1', expectedHash: presentedHash }),
      );
      expect(result.access_token).toBe('new.access.jwt');
      expect(result.refresh_token).toBe('new.refresh.jwt');
      expect(result.permissions).toEqual(['READ incidents']);
      expect(graceBuffer.set).toHaveBeenCalledWith(
        'sid-1',
        presentedHash,
        { access_token: 'new.access.jwt', refresh_token: 'new.refresh.jwt' },
        30,
        null,
      );
    });

    it('CAS-loss (0 rows, concurrent winner already committed) re-reads and resolves through grace, not revoke', async () => {
      verifyReturns({ sid: 'sid-1', sub: 'user-1' });
      const presentedToken = 'presented.refresh.jwt';
      const { createHash } = jest.requireActual('crypto');
      const presentedHash = createHash('sha256').update(presentedToken, 'utf8').digest('hex');
      const rotatedAtRecent = new Date(Date.now() - 2_000); // 2s ago, well within default 30s grace

      // First read: presented matches CURRENT (about to attempt CAS).
      sessionsRepository.findActiveById.mockResolvedValueOnce(
        makeSessionRow({ refresh_token_hash: presentedHash, previous_refresh_token_hash: null }),
      );
      // The service speculatively signs a new pair before attempting the
      // CAS — mocked here even though the CAS is about to lose.
      jwtService.sign.mockReturnValueOnce('speculative.access.jwt').mockReturnValueOnce('speculative.refresh.jwt');
      sessionsRepository.rotate.mockResolvedValue(null); // lost the CAS

      // Re-read after the loss: winner already shifted current->previous.
      sessionsRepository.findActiveById.mockResolvedValueOnce(
        makeSessionRow({
          refresh_token_hash: 'winners-new-hash',
          previous_refresh_token_hash: presentedHash,
          rotated_at: rotatedAtRecent,
        }),
      );
      graceBuffer.get.mockResolvedValue({
        access_token: 'winner.access.jwt',
        refresh_token: 'winner.refresh.jwt',
      });
      dataSource.query.mockResolvedValue([]);

      const result = await service.refresh(presentedToken);

      expect(result.access_token).toBe('winner.access.jwt');
      expect(result.refresh_token).toBe('winner.refresh.jwt');
      expect(sessionsRepository.revoke).not.toHaveBeenCalled();
      expect(graceBuffer.get).toHaveBeenCalledWith('sid-1', presentedHash);
    });

    it('grace path in-window: buffer hit returns the verbatim pair, zero DB writes', async () => {
      verifyReturns({ sid: 'sid-1', sub: 'user-1' });
      const presentedToken = 'previous.refresh.jwt';
      const { createHash } = jest.requireActual('crypto');
      const presentedHash = createHash('sha256').update(presentedToken, 'utf8').digest('hex');
      const rotatedAtRecent = new Date(Date.now() - 5_000);

      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({
          refresh_token_hash: 'current-hash-not-presented',
          previous_refresh_token_hash: presentedHash,
          rotated_at: rotatedAtRecent,
        }),
      );
      graceBuffer.get.mockResolvedValue({
        access_token: 'buffered.access.jwt',
        refresh_token: 'buffered.refresh.jwt',
      });
      dataSource.query.mockResolvedValue([]);

      const result = await service.refresh(presentedToken);

      expect(result.access_token).toBe('buffered.access.jwt');
      expect(result.refresh_token).toBe('buffered.refresh.jwt');
      expect(sessionsRepository.rotate).not.toHaveBeenCalled();
      expect(sessionsRepository.revoke).not.toHaveBeenCalled();
    });

    it('grace out-of-window: revokes and 401s SESSION_REUSE_DETECTED', async () => {
      verifyReturns({ sid: 'sid-1', sub: 'user-1' });
      const presentedToken = 'stale.refresh.jwt';
      const { createHash } = jest.requireActual('crypto');
      const presentedHash = createHash('sha256').update(presentedToken, 'utf8').digest('hex');
      const rotatedAtOld = new Date(Date.now() - 120_000); // well past the 30s default grace

      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({
          refresh_token_hash: 'current-hash',
          previous_refresh_token_hash: presentedHash,
          rotated_at: rotatedAtOld,
        }),
      );
      sessionsRepository.revoke.mockResolvedValue(
        makeSessionRow({ expires_at: new Date(Date.now() + 10_000) }),
      );

      try {
        await service.refresh(presentedToken);
        fail('expected UnauthorizedException');
      } catch (err) {
        expect((err as UnauthorizedException).getResponse()).toMatchObject({
          code: 'SESSION_REUSE_DETECTED',
        });
      }
      expect(sessionsRepository.revoke).toHaveBeenCalledWith('sid-1');
      expect(revocationCache.revoke).toHaveBeenCalledWith('sid-1', expect.any(Number));
    });

    it('grace in-window but buffer miss: 401s SESSION_RETRY_UNAVAILABLE, does NOT revoke ([R3])', async () => {
      verifyReturns({ sid: 'sid-1', sub: 'user-1' });
      const presentedToken = 'previous.refresh.jwt';
      const { createHash } = jest.requireActual('crypto');
      const presentedHash = createHash('sha256').update(presentedToken, 'utf8').digest('hex');
      const rotatedAtRecent = new Date(Date.now() - 3_000);

      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({
          refresh_token_hash: 'current-hash',
          previous_refresh_token_hash: presentedHash,
          rotated_at: rotatedAtRecent,
        }),
      );
      graceBuffer.get.mockResolvedValue(null);

      try {
        await service.refresh(presentedToken);
        fail('expected UnauthorizedException');
      } catch (err) {
        expect((err as UnauthorizedException).getResponse()).toMatchObject({
          code: 'SESSION_RETRY_UNAVAILABLE',
        });
      }
      expect(sessionsRepository.revoke).not.toHaveBeenCalled();
      expect(revocationCache.revoke).not.toHaveBeenCalled();
    });

    it('a token two generations old revokes even inside the current rotation window', async () => {
      verifyReturns({ sid: 'sid-1', sub: 'user-1' });
      const twoGenAgoToken = 'two-generations-old.jwt';
      const rotatedAtRecent = new Date(Date.now() - 2_000); // in-window for the CURRENT rotation

      sessionsRepository.findActiveById.mockResolvedValue(
        makeSessionRow({
          refresh_token_hash: 'current-hash',
          previous_refresh_token_hash: 'the-immediately-previous-hash', // NOT twoGenAgoToken's hash
          rotated_at: rotatedAtRecent,
        }),
      );
      sessionsRepository.revoke.mockResolvedValue(
        makeSessionRow({ expires_at: new Date(Date.now() + 10_000) }),
      );

      try {
        await service.refresh(twoGenAgoToken);
        fail('expected UnauthorizedException');
      } catch (err) {
        expect((err as UnauthorizedException).getResponse()).toMatchObject({
          code: 'SESSION_REUSE_DETECTED',
        });
      }
      expect(sessionsRepository.revoke).toHaveBeenCalledWith('sid-1');
    });
  });

  describe('revokeSession (task 4.7 — logout / DELETE /sessions/:id)', () => {
    it('revokes the row and writes the denylist entry with the remaining TTL', async () => {
      sessionsRepository.revoke.mockResolvedValue(
        makeSessionRow({ id: 'sid-1', expires_at: new Date(Date.now() + 10_000) }),
      );

      await service.revokeSession('sid-1');

      expect(sessionsRepository.revoke).toHaveBeenCalledWith('sid-1');
      expect(revocationCache.revoke).toHaveBeenCalledWith('sid-1', expect.any(Number));
    });

    it('is a no-op when the session is already revoked (repository returns null)', async () => {
      sessionsRepository.revoke.mockResolvedValue(null);

      await service.revokeSession('sid-1');

      expect(revocationCache.revoke).not.toHaveBeenCalled();
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
      makeDataSource() as unknown as DataSource,
      makeSessionsRepository() as unknown as SessionsRepository,
      makeRevocationCache() as unknown as RevocationCache,
      makeGraceBuffer() as unknown as GraceBuffer,
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

describe('AuthService.getAuthContextByUserId (T3.2 D6; T3.9 design §3 [R4] — isAnonymous + perm:v3:)', () => {
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
      dataSource as unknown as DataSource,
      makeSessionsRepository() as unknown as SessionsRepository,
      makeRevocationCache() as unknown as RevocationCache,
      makeGraceBuffer() as unknown as GraceBuffer,
    );
  });

  it('resolves the full AuthContext from a single joined query on a cache miss', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      {
        permissions: ['READ incidents', 'UPDATE incidents'],
        organization_id: 'org-1',
        device_uuid: 'device-abc',
        role_name: 'admin_org',
      },
    ]);

    const ctx = await service.getAuthContextByUserId('user-1');

    expect(ctx).toEqual({
      userId: 'user-1',
      permissions: ['READ incidents', 'UPDATE incidents'],
      organizationId: 'org-1',
      roleName: 'admin_org',
      scope: { kind: 'org', organizationId: 'org-1' },
      sessionId: null,
      isAnonymous: false,
    });
  });

  it('caches under the perm:v3:uid: prefix (distinct from the legacy perm:v2: shape)', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      { permissions: ['READ incidents'], organization_id: null, device_uuid: 'device-abc', role_name: null },
    ]);

    await service.getAuthContextByUserId('user-1');

    expect(cache.set).toHaveBeenCalledWith(
      `${PERMISSION_CACHE_PREFIX}uid:user-1`,
      { permissions: ['READ incidents'], organizationId: null, roleName: null, isAnonymous: false },
      expect.any(Number),
    );
    expect(PERMISSION_CACHE_PREFIX).toBe('perm:v3:');
  });

  it('serves a cached AuthContext without hitting the database (cache hit)', async () => {
    cache.get.mockResolvedValue({
      permissions: ['READ incidents'],
      organizationId: 'org-1',
      roleName: 'admin_org',
      isAnonymous: false,
    });

    const ctx = await service.getAuthContextByUserId('user-1');

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(ctx).toEqual({
      userId: 'user-1',
      permissions: ['READ incidents'],
      organizationId: 'org-1',
      roleName: 'admin_org',
      scope: { kind: 'org', organizationId: 'org-1' },
      sessionId: null,
      isAnonymous: false,
    });
  });

  // ANON (sc-327) — la rama "anonymous grants" del round 0
  // desaparece. La decisión de producto cierra la identidad
  // anónima: un usuario con `device_uuid = 'anonymous'` no puede
  // iniciar sesión, y `getAuthContextByUserId` con un id que
  // pertenece a la fila máscara ya no devuelve permisos — el
  // `anonymousPermissions` queda vacío (B.1) y la fila máscara
  // tiene `permissions = []` en BD (B.2).
  //
  // Mantener un test que afirma el viejo comportamiento sería
  // mentir sobre el estado del código. La regla del round 0
  // ("el anonymous grants el ceiling público") se invierte a
  // ("el anonymous grants la lista vacía") — el spec cambia de
  // forma paralela al código.
  it('ANON: getAuthContextByUserId for the anonymous row now returns an empty permission set', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      {
        // ANON B.2 — la fila máscara tiene `permissions = []` en BD
        // (la migración 0048 vacía la denormalización que 0008 había
        // populado). El cache hit en producción debería reflejar
        // el mismo estado; el test pasa por la rama sin cache.
        permissions: [],
        organization_id: null,
        device_uuid: 'anonymous',
        role_name: null,
      },
    ]);

    const ctx = await service.getAuthContextByUserId('anon-row-id');

    // Sin permisos. El resto del shape (organizationId, roleName,
    // scope, isAnonymous, sessionId) se mantiene porque otras
    // rutas (AUD) leen la fila para distinguir el autor anónimo
    // de un `reporter` autenticado. El comportamiento de
    // ANON es quitar GRANT, no ELIMINAR la identidad.
    expect(ctx.permissions).toEqual([]);
    expect(ctx.organizationId).toBeNull();
    expect(ctx.roleName).toBeNull();
    expect(ctx.scope).toEqual({ kind: 'public' });
    expect(ctx.isAnonymous).toBe(true);
    expect(ctx.sessionId).toBeNull();
  });

  it('returns a public-scoped empty context for an unknown user id, uncached', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([]);

    const ctx = await service.getAuthContextByUserId('ghost');

    expect(ctx.permissions).toEqual([]);
    expect(ctx.scope).toEqual({ kind: 'public' });
    expect(ctx.isAnonymous).toBe(false);
    expect(ctx.sessionId).toBeNull();
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

  // T7.2.C4 (R7.5) — a soft-deleted role must grant ZERO permissions even
  // though `users.permissions` still holds the stale denormalized array;
  // `role_deleted_at` comes back non-null from the LEFT JOIN and this
  // method treats that exactly like "no role assigned" for both
  // permissions and roleName (PermissionGuard's default-deny then 403s
  // any @RequirePermission route).
  it('a soft-deleted assigned role resolves to zero permissions and null roleName (R7.5)', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      {
        permissions: ['READ incidents', 'UPDATE incidents'],
        organization_id: 'org-1',
        device_uuid: 'device-abc',
        role_name: 'operador_org',
        role_deleted_at: new Date('2026-08-25T00:00:00Z'),
      },
    ]);

    const ctx = await service.getAuthContextByUserId('user-1');

    expect(ctx.permissions).toEqual([]);
    expect(ctx.roleName).toBeNull();
  });

  it('a live (non-deleted) assigned role is unaffected by the role_deleted_at column', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      {
        permissions: ['READ incidents'],
        organization_id: 'org-1',
        device_uuid: 'device-abc',
        role_name: 'operador_org',
        role_deleted_at: null,
      },
    ]);

    const ctx = await service.getAuthContextByUserId('user-1');

    expect(ctx.permissions).toEqual(['READ incidents']);
    expect(ctx.roleName).toBe('operador_org');
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
      dataSource as unknown as DataSource,
      makeSessionsRepository() as unknown as SessionsRepository,
      makeRevocationCache() as unknown as RevocationCache,
      makeGraceBuffer() as unknown as GraceBuffer,
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

  // ANON (sc-327) — la decisión de producto cierra la identidad
  // anónima. La fila máscara sigue existiendo (AUD la recicla
  // como autoría de publicaciones), pero ya no concede permisos.
  // Antes (round 0) este test afirmaba el techo de los 4 — la
  // afirmación se invierte: la lista ahora es vacía.
  it('ANON: getPermissionsByUserId for the anonymous row returns [] (the ceiling is empty)', async () => {
    cache.get.mockResolvedValue(undefined);
    dataSource.query.mockResolvedValue([
      { permissions: [], organization_id: null, device_uuid: 'anonymous', role_name: null },
    ]);

    const permissions = await service.getPermissionsByUserId('anon-row-id');

    // Lista vacía. La fila máscara sigue en BD (migración 0048
    // NO la borra — AUD la necesita). El "ceiling" es ahora
    // un piso en el suelo: `getAuthContextByUserId` para el
    // anonymous row retorna un `AuthContext` con `permissions: []`
    // y `isAnonymous: true` (la firma del isAnonymous se mantiene
    // porque AUD la usa para distinguir la autoría).
    expect(permissions).toEqual([]);
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
