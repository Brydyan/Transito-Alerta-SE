import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { UsersService, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './users.service';
import { UserEntity } from '../../entities/user.entity';
import { RoleEntity } from '../../entities/role.entity';
import { AuthContext, SubjectScope } from '../../common/authz/subject-scope';
import { AuthService } from '../auth/auth.service';
import { SessionsRepository } from '../sessions/sessions.repository';

const GLOBAL_SCOPE: SubjectScope = { kind: 'global' };
const ORG_A_SCOPE: SubjectScope = { kind: 'org', organizationId: 'org-A' };
const ORG_ASSIGNED_SCOPE: SubjectScope = {
  kind: 'org_assigned',
  organizationId: 'org-A',
  userId: 'user-1',
};
const PUBLIC_SCOPE: SubjectScope = { kind: 'public' };
const DENY_SCOPE: SubjectScope = { kind: 'deny', reason: 'staff_without_organization' };

describe('UsersService', () => {
  let userRepo: { findOne: jest.Mock; update: jest.Mock; findAndCount: jest.Mock };
  let avatarStorage: { upload: jest.Mock };
  let roleRepo: { findOne: jest.Mock };
  let authService: { invalidatePermissionCache: jest.Mock };
  let sessionsRepository: {
    findActiveByUser: jest.Mock;
    findManageableTarget: jest.Mock;
  };
  let service: UsersService;

  beforeEach(() => {
    userRepo = { findOne: jest.fn(), update: jest.fn(), findAndCount: jest.fn() };
    avatarStorage = { upload: jest.fn() };
    roleRepo = { findOne: jest.fn() };
    authService = { invalidatePermissionCache: jest.fn() };
    sessionsRepository = { findActiveByUser: jest.fn(), findManageableTarget: jest.fn() };
    service = new UsersService(
      userRepo as unknown as jest.Mocked<Repository<UserEntity>>,
      avatarStorage as unknown as any,
      roleRepo as unknown as jest.Mocked<Repository<RoleEntity>>,
      authService as unknown as AuthService,
      sessionsRepository as unknown as SessionsRepository,
    );
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1' });
      const result = await service.findById('u1');
      expect(result).toEqual({ id: 'u1' });
    });

    it('throws NotFoundException when missing', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('updates first_name/last_name and returns the fresh row', async () => {
      userRepo.update.mockResolvedValue({ affected: 1 });
      userRepo.findOne.mockResolvedValue({ id: 'u1', firstName: 'Ana', lastName: 'Lopez' });

      const result = await service.updateProfile('u1', { firstName: 'Ana', lastName: 'Lopez' });

      expect(userRepo.update).toHaveBeenCalledWith('u1', { firstName: 'Ana', lastName: 'Lopez' });
      expect(result.firstName).toBe('Ana');
    });
  });

  describe('updateAvatar', () => {
    it('uploads via AvatarStorageService and persists the signed URL, without any live S3 call', async () => {
      avatarStorage.upload.mockResolvedValue('https://storage.example.com/avatars/u1/x.png?sig=abc');
      userRepo.update.mockResolvedValue({ affected: 1 });
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        avatarUrl: 'https://storage.example.com/avatars/u1/x.png?sig=abc',
      });

      const file = { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'x.png' };
      const result = await service.updateAvatar('u1', file);

      expect(avatarStorage.upload).toHaveBeenCalledWith('u1', file);
      expect(userRepo.update).toHaveBeenCalledWith('u1', {
        avatarUrl: 'https://storage.example.com/avatars/u1/x.png?sig=abc',
      });
      expect(result.avatarUrl).toContain('storage.example.com');
    });
  });

  describe('list (T3.2 D3 — scope is a required, no-default parameter)', () => {
    it('applies the default page size when none is given', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, GLOBAL_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: DEFAULT_PAGE_SIZE, skip: 0 }),
      );
    });

    it('caps an oversized limit at MAX_PAGE_SIZE', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(1, 10_000, GLOBAL_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: MAX_PAGE_SIZE }),
      );
    });

    it('computes skip from the page number', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(3, 20, GLOBAL_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 40 }),
      );
    });

    it('global scope applies no organization filter', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, GLOBAL_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.not.objectContaining({ where: expect.anything() }),
      );
    });

    it('org scope filters by organization_id', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, ORG_A_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-A' } }),
      );
    });

    it('org_assigned scope filters by the same organization_id (D3 table)', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, ORG_ASSIGNED_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-A' } }),
      );
    });

    it('public scope returns self only', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1' });

      const result = await service.list(undefined, undefined, PUBLIC_SCOPE, 'user-1');

      expect(userRepo.findAndCount).not.toHaveBeenCalled();
      expect(result.items).toEqual([{ id: 'user-1' }]);
      expect(result.total).toBe(1);
    });

    it('deny scope returns an empty page without querying', async () => {
      const result = await service.list(undefined, undefined, DENY_SCOPE);

      expect(userRepo.findAndCount).not.toHaveBeenCalled();
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('getSessionsForSelf (T3.9 D9 — self, no permission/rank check)', () => {
    function makeSelfActor(overrides: Partial<AuthContext> = {}): AuthContext {
      return {
        userId: 'user-1',
        permissions: [],
        organizationId: null,
        roleName: null,
        scope: PUBLIC_SCOPE,
        sessionId: 'sid-current',
        isAnonymous: false,
        ...overrides,
      };
    }

    it('lists the actor own active sessions, marking the current one', async () => {
      sessionsRepository.findActiveByUser.mockResolvedValue([
        {
          id: 'sid-current',
          device_uuid: 'device-a',
          ip_address: null,
          user_agent: null,
          created_at: new Date(),
          last_used_at: null,
          expires_at: new Date(),
        },
        {
          id: 'sid-other',
          device_uuid: 'device-b',
          ip_address: null,
          user_agent: null,
          created_at: new Date(),
          last_used_at: null,
          expires_at: new Date(),
        },
      ]);

      const result = await service.getSessionsForSelf(makeSelfActor());

      expect(sessionsRepository.findActiveByUser).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(2);
      expect(result.find((s) => s.id === 'sid-current')!.current).toBe(true);
      expect(result.find((s) => s.id === 'sid-other')!.current).toBe(false);
      // Never leaks a hash field.
      expect(result[0]).not.toHaveProperty('refresh_token_hash');
    });
  });

  describe('getSessionsForUser (T3.9 D9 — READ, visibility only, never rank)', () => {
    function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
      return {
        userId: 'admin-1',
        permissions: ['READ sessions'],
        organizationId: 'org-A',
        roleName: 'admin_organizacion',
        scope: { kind: 'org', organizationId: 'org-A' },
        sessionId: 'sid-admin',
        isAnonymous: false,
        ...overrides,
      };
    }

    it('lists the target user sessions when visible under actor scope', async () => {
      const actor = makeActor();
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-A',
        roleName: 'operador_organizacion',
      });
      sessionsRepository.findActiveByUser.mockResolvedValue([]);

      await service.getSessionsForUser(actor, 'target-1');

      expect(sessionsRepository.findActiveByUser).toHaveBeenCalledWith('target-1');
    });

    it('throws 404 when the target user does not exist', async () => {
      sessionsRepository.findManageableTarget.mockResolvedValue(null);

      await expect(service.getSessionsForUser(makeActor(), 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when the target is not visible under the actor scope (cross-org)', async () => {
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-B',
        roleName: 'operador_organizacion',
      });

      await expect(
        service.getSessionsForUser(makeActor({ scope: { kind: 'org', organizationId: 'org-A' } }), 'target-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(sessionsRepository.findActiveByUser).not.toHaveBeenCalled();
    });

    it('does NOT rank-gate — a lower-ranked actor can still list a visible higher-ranked target (D9: read != write)', async () => {
      const actor = makeActor({ roleName: 'operador_organizacion' });
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-A',
        roleName: 'admin_sistema', // outranks the actor
      });
      sessionsRepository.findActiveByUser.mockResolvedValue([]);

      await expect(service.getSessionsForUser(actor, 'target-1')).resolves.toEqual([]);
    });
  });

  describe('updateOrganization (T3.2 D12 — PATCH /users/:id/organization)', () => {
    function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
      return {
        userId: 'admin-1',
        permissions: ['UPDATE users'],
        organizationId: null,
        roleName: 'admin_sistema',
        scope: { kind: 'global' },
        sessionId: 'sid-admin-1',
        isAnonymous: false,
        ...overrides,
      };
    }

    it('moves the target user to the new organization and invalidates their permission cache', async () => {
      const actor = makeActor();
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: null,
        roleId: 'role-1',
        deviceUuid: 'device-target',
      });
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'operador_organizacion' });
      userRepo.update.mockResolvedValue({ affected: 1 });
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: 'org-A',
        deviceUuid: 'device-target',
      });

      const result = await service.updateOrganization(actor, 'target-1', 'org-A');

      expect(userRepo.update).toHaveBeenCalledWith('target-1', { organizationId: 'org-A' });
      expect(authService.invalidatePermissionCache).toHaveBeenCalledWith(
        'target-1',
        'device-target',
      );
      expect(result.organizationId).toBe('org-A');
    });

    it('accepts organization_id: null to remove a user from their organization', async () => {
      const actor = makeActor();
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: 'org-A',
        roleId: 'role-1',
        deviceUuid: 'device-target',
      });
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'operador_organizacion' });
      userRepo.update.mockResolvedValue({ affected: 1 });
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: null,
        deviceUuid: 'device-target',
      });

      const result = await service.updateOrganization(actor, 'target-1', null);

      expect(userRepo.update).toHaveBeenCalledWith('target-1', { organizationId: null });
      expect(result.organizationId).toBeNull();
    });

    it('throws 404 when the target is not visible under the actor scope', async () => {
      const actor = makeActor({
        roleName: 'admin_organizacion',
        organizationId: 'org-B',
        scope: { kind: 'org', organizationId: 'org-B' },
      });
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: 'org-A',
        roleId: 'role-1',
        deviceUuid: 'device-target',
      });
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'operador_organizacion' });

      await expect(service.updateOrganization(actor, 'target-1', 'org-B')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it('throws 403 INSUFFICIENT_ROLE_RANK when the target outranks or equals the actor', async () => {
      const actor = makeActor({
        roleName: 'admin_organizacion',
        organizationId: 'org-A',
        scope: { kind: 'org', organizationId: 'org-A' },
      });
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: 'org-A',
        roleId: 'role-sys',
        deviceUuid: 'device-target',
      });
      roleRepo.findOne.mockResolvedValue({ id: 'role-sys', name: 'admin_sistema' });

      await expect(service.updateOrganization(actor, 'target-1', 'org-B')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it('throws 404 when the target user does not exist', async () => {
      const actor = makeActor();
      userRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateOrganization(actor, 'missing', 'org-A'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
