import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import type { DataSource, Repository } from 'typeorm';

import { AuthService } from './auth.service';
import { UserEntity } from '../../entities/user.entity';
import { GraceBuffer } from '../sessions/grace-buffer';
import { RevocationCache } from '../sessions/revocation-cache';
import { SessionsRepository } from '../sessions/sessions.repository';
import { PasswordHasher } from './password-hasher';

/**
 * T3.6 task 8.3/8.6/9.3 — new AuthService methods added on top of the
 * pre-existing, byte-for-byte-preserved `auth.service.spec.ts` (which is
 * the regression gate for the device path and MUST stay unmodified). A
 * SEPARATE file so nothing here can accidentally touch that file.
 */
function makeAuthConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    jwtAccessSecret: 'access-secret',
    jwtRefreshSecret: 'refresh-secret',
    jwtAccessExpiresIn: '15m',
    jwtRefreshExpiresIn: '7d',
    permissionCacheTtlSeconds: 3600,
    anonymousDeviceUuid: 'anonymous',
    anonymousPermissions: ['READ incidents', 'CREATE incidents', 'READ comments', 'CREATE comments'],
    sessionRefreshGraceSeconds: 30,
    sessionRefreshTtlSeconds: 604800,
    bcryptCost: 4,
    passwordMinLength: 12,
    ...overrides,
  };
}

function makeSessionsRepository() {
  return {
    create: jest.fn(),
    findActiveById: jest.fn(),
    findActiveByUser: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
    existsRevoked: jest.fn(),
    findRevokedUnexpired: jest.fn(),
    findManageableTarget: jest.fn(),
  };
}

describe('AuthService — password identity (T3.6)', () => {
  let userRepo: { findOne: jest.Mock; update: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let configService: ConfigService;
  let dataSource: { query: jest.Mock };
  let sessionsRepository: ReturnType<typeof makeSessionsRepository>;
  let revocationCache: { isRevoked: jest.Mock; revoke: jest.Mock };
  let graceBuffer: { set: jest.Mock; get: jest.Mock; clear: jest.Mock };
  let passwordHasher: { hash: jest.Mock; verify: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    userRepo = { findOne: jest.fn(), update: jest.fn() };
    jwtService = { sign: jest.fn(), verify: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    configService = { get: () => makeAuthConfig() } as unknown as ConfigService;
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    sessionsRepository = makeSessionsRepository();
    revocationCache = { isRevoked: jest.fn(), revoke: jest.fn() };
    graceBuffer = { set: jest.fn(), get: jest.fn(), clear: jest.fn() };
    passwordHasher = { hash: jest.fn(), verify: jest.fn() };
    service = new AuthService(
      userRepo as unknown as jest.Mocked<Repository<UserEntity>>,
      jwtService as unknown as JwtService,
      cache as unknown as jest.Mocked<Cache>,
      configService,
      dataSource as unknown as DataSource,
      sessionsRepository as unknown as SessionsRepository,
      revocationCache as unknown as RevocationCache,
      graceBuffer as unknown as GraceBuffer,
      passwordHasher as unknown as PasswordHasher,
    );
  });

  describe('loginWithPassword (design D1/D9)', () => {
    it('unknown email: bcrypt.compare STILL runs (against DUMMY_HASH) then 401 INVALID_CREDENTIALS', async () => {
      userRepo.findOne.mockResolvedValue(null);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(
        service.loginWithPassword({ email: 'ghost@x.com', password: 'whatever12345', deviceUuid: null }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(passwordHasher.verify).toHaveBeenCalledTimes(1);
      const [, hashArg] = passwordHasher.verify.mock.calls[0];
      expect(hashArg).toMatch(/^\$2[aby]\$\d{2}\$/); // DUMMY_HASH, a real bcrypt hash
    });

    it('null password_hash (device-only user somehow queried by email): bcrypt.compare runs, 401', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1', passwordHash: null, isActive: true });
      passwordHasher.verify.mockResolvedValue(false);

      await expect(
        service.loginWithPassword({ email: 'a@b.com', password: 'wrong-password', deviceUuid: null }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(passwordHasher.verify).toHaveBeenCalledTimes(1);
    });

    it('inactive user: 401 even with a correct password', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'user-1',
        passwordHash: '$2b$04$hash',
        isActive: false,
      });
      passwordHasher.verify.mockResolvedValue(true);

      await expect(
        service.loginWithPassword({ email: 'a@b.com', password: 'correct12345', deviceUuid: null }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('success: issues a session via the same issueSession machinery (sid on both tokens, session row written)', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'user-1',
        passwordHash: '$2b$04$hash',
        isActive: true,
      });
      passwordHasher.verify.mockResolvedValue(true);
      dataSource.query.mockResolvedValue([
        { permissions: ['READ incidents'], organization_id: null, device_uuid: null, role_name: 'reporter' },
      ]);
      jwtService.sign.mockReturnValueOnce('access.jwt').mockReturnValueOnce('refresh.jwt');
      sessionsRepository.create.mockResolvedValue({ id: 'sid-new' });

      const result = await service.loginWithPassword({
        email: 'a@b.com',
        password: 'correct12345',
        deviceUuid: null,
      });

      expect(result.access_token).toBe('access.jwt');
      expect(result.permissions).toEqual(['READ incidents']);
      expect(sessionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', deviceUuid: null }),
      );
      const accessPayload = jwtService.sign.mock.calls[0][0];
      const refreshPayload = jwtService.sign.mock.calls[1][0];
      expect(accessPayload.sid).toBeDefined();
      expect(accessPayload.sid).toBe(refreshPayload.sid);
    });

    it('a device_uuid supplied alongside email+password is passed through as a session LABEL only (D7)', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1', passwordHash: '$2b$04$hash', isActive: true });
      passwordHasher.verify.mockResolvedValue(true);
      dataSource.query.mockResolvedValue([]);
      jwtService.sign.mockReturnValueOnce('a').mockReturnValueOnce('r');
      sessionsRepository.create.mockResolvedValue({ id: 'sid-new' });

      await service.loginWithPassword({
        email: 'a@b.com',
        password: 'correct12345',
        deviceUuid: 'my-laptop-label',
      });

      expect(sessionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ deviceUuid: 'my-laptop-label' }),
      );
    });
  });

  describe('issueSessionForNewIdentity (invitation redemption)', () => {
    it('mints a session for a bare userId, deviceUuid always null (D12)', async () => {
      dataSource.query.mockResolvedValue([
        { permissions: ['READ incidents'], organization_id: null, device_uuid: null, role_name: 'reporter' },
      ]);
      jwtService.sign.mockReturnValueOnce('a').mockReturnValueOnce('r');
      sessionsRepository.create.mockResolvedValue({ id: 'sid-1' });

      const result = await service.issueSessionForNewIdentity('new-user-1');

      expect(result.access_token).toBe('a');
      expect(sessionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'new-user-1', deviceUuid: null }),
      );
    });
  });

  describe('revokeAllForUser (design D5/D6 — spares nobody)', () => {
    it('revokes every row SessionsRepository.revokeAllForUser returns and fans out to RevocationCache per row', async () => {
      const future = new Date(Date.now() + 100_000);
      sessionsRepository.revokeAllForUser.mockResolvedValue([
        { id: 'sid-1', expires_at: future },
        { id: 'sid-2', expires_at: future },
      ]);

      await service.revokeAllForUser('user-1');

      expect(sessionsRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(revocationCache.revoke).toHaveBeenCalledWith('sid-1', expect.any(Number));
      expect(revocationCache.revoke).toHaveBeenCalledWith('sid-2', expect.any(Number));
      expect(revocationCache.revoke).toHaveBeenCalledTimes(2);
    });

    it('is a no-op (zero denylist writes) when the user has no active sessions', async () => {
      sessionsRepository.revokeAllForUser.mockResolvedValue([]);

      await service.revokeAllForUser('user-1');

      expect(revocationCache.revoke).not.toHaveBeenCalled();
    });
  });

  describe('changePassword (PUT /auth/password, SELF-only, D5)', () => {
    it('401 INVALID_CREDENTIALS on a wrong current password, no write, no revoke', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1', passwordHash: '$2b$04$old' });
      passwordHasher.verify.mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', 'wrong-current', 'brandnewpassword123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userRepo.update).not.toHaveBeenCalled();
      expect(sessionsRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('success: writes the new hash then revokes every session including the caller own (D5)', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1', passwordHash: '$2b$04$old' });
      passwordHasher.verify.mockResolvedValue(true);
      passwordHasher.hash.mockResolvedValue('$2b$04$new');
      sessionsRepository.revokeAllForUser.mockResolvedValue([]);

      await service.changePassword('user-1', 'correct-current12', 'brandnewpassword123');

      expect(userRepo.update).toHaveBeenCalledWith('user-1', { passwordHash: '$2b$04$new' });
      expect(sessionsRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getPermissions (T3.6 D8 — null guard)', () => {
    it('returns [] immediately for deviceUuid=null, no cache read, no DB query', async () => {
      const result = await service.getPermissions(null);

      expect(result).toEqual([]);
      expect(cache.get).not.toHaveBeenCalled();
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('getMe (T3.6 D8 — widened to device_uuid: string | null)', () => {
    it('resolves permissions via getPermissionsByUserId (uid-keyed), not the device-keyed cache', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1', deviceUuid: null });
      dataSource.query.mockResolvedValue([
        { permissions: ['READ incidents'], organization_id: null, device_uuid: null, role_name: 'reporter' },
      ]);

      const result = await service.getMe('user-1');

      expect(result).toEqual({ deviceUuid: null, permissions: ['READ incidents'] });
      expect(cache.get).toHaveBeenCalledWith('perm:v3:uid:user-1');
    });
  });

  describe('invalidatePermissionCache (T3.6 D8 — skips the device-keyed del when null)', () => {
    it('deletes only the uid-keyed entry when deviceUuid is null', async () => {
      await service.invalidatePermissionCache('user-1', null);

      expect(cache.del).toHaveBeenCalledWith('perm:v3:uid:user-1');
      expect(cache.del).toHaveBeenCalledTimes(1);
    });

    it('deletes both entries when deviceUuid is present (unchanged pre-T3.6 behaviour)', async () => {
      await service.invalidatePermissionCache('user-1', 'device-abc');

      expect(cache.del).toHaveBeenCalledWith('perm:v3:uid:user-1');
      expect(cache.del).toHaveBeenCalledWith('perm:v3:device-abc');
      expect(cache.del).toHaveBeenCalledTimes(2);
    });
  });
});
