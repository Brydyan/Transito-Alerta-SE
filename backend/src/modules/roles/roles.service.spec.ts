import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import { RolesService } from './roles.service';
import { RoleEntity } from '../../entities/role.entity';
import { UserEntity } from '../../entities/user.entity';
import { PermissionEntity } from '../../entities/permission.entity';
import { AuthService } from '../auth/auth.service';
import { AuthContext } from '../../common/authz/subject-scope';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'admin-1',
    permissions: ['ASSIGN roles'],
    organizationId: null,
    roleName: 'admin_sistema',
    scope: { kind: 'global' },
    sessionId: 'session-admin-1',
    isAnonymous: false,
    ...overrides,
  };
}

describe('RolesService', () => {
  let roleRepo: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock };
  let userRepo: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock };
  let permissionRepo: { find: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let authService: { invalidatePermissionCache: jest.Mock };
  let service: RolesService;

  beforeEach(() => {
    roleRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn(async (x) => x) };
    userRepo = { findOne: jest.fn(), find: jest.fn(async () => []), save: jest.fn(async (x) => x) };
    permissionRepo = { find: jest.fn(async () => []) };
    dataSource = { transaction: jest.fn(async (cb) => cb({ getRepository: () => ({ save: async (x: unknown) => x }) })) };
    authService = { invalidatePermissionCache: jest.fn() };
    service = new RolesService(
      roleRepo as unknown as jest.Mocked<Repository<RoleEntity>>,
      userRepo as unknown as jest.Mocked<Repository<UserEntity>>,
      permissionRepo as unknown as jest.Mocked<Repository<PermissionEntity>>,
      dataSource as unknown as DataSource,
      authService as unknown as jest.Mocked<AuthService>,
    );
  });

  describe('listPermissions', () => {
    it('returns the permission strings assigned to a role', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-1',
        name: 'operator',
        permissions: ['READ incidents', 'UPDATE incidents'],
      });

      const result = await service.listPermissions('role-1');

      expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { id: 'role-1' } });
      expect(result).toEqual(['READ incidents', 'UPDATE incidents']);
    });

    it('throws NotFoundException for an unknown role id', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.listPermissions('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    // R6: a role that exists but carries no permissions must still resolve
    // to an empty set, not throw — the caller (a user holding ONLY that
    // role) is then denied everything by PermissionGuard's default-deny,
    // not by an error here.
    it('returns an empty array for a role with no assigned permissions (R6)', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-2', name: 'empty-role', permissions: [] });

      const result = await service.listPermissions('role-2');

      expect(result).toEqual([]);
    });
  });

  describe('assignRole', () => {
    it('throws NotFoundException when the role does not exist', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.assignRole(makeActor(), 'user-1', 'ghost-role')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', permissions: ['READ incidents'] });
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.assignRole(makeActor(), 'ghost-user', 'role-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('denormalizes the role permissions onto the user row and bumps permission_version (D2 pv)', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-1',
        name: 'operator',
        permissions: ['READ incidents', 'UPDATE incidents'],
      });
      userRepo.findOne.mockResolvedValue({
        id: 'user-1',
        deviceUuid: 'device-abc',
        permissions: [],
        permissionVersion: 1,
      });

      const result = await service.assignRole(makeActor(), 'user-1', 'role-1');

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          roleId: 'role-1',
          permissions: ['READ incidents', 'UPDATE incidents'],
          permissionVersion: 2,
        }),
      );
      expect(result.permissionVersion).toBe(2);
    });

    it('invalidates BOTH cached permission keys after reassignment (D2)', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', permissions: ['READ incidents'] });
      userRepo.findOne.mockResolvedValue({
        id: 'user-1',
        deviceUuid: 'device-abc',
        permissions: [],
        permissionVersion: 1,
      });

      await service.assignRole(makeActor(), 'user-1', 'role-1');

      expect(authService.invalidatePermissionCache).toHaveBeenCalledWith(
        'user-1',
        'device-abc',
      );
    });

    // R6: a role with an empty permission set assigned to a user must
    // still deny every mutating action for them afterward — assignRole
    // itself must not special-case an empty array away.
    it('assigning a role with no permissions leaves the user with an empty permission set (R6)', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'empty-role', permissions: [] });
      userRepo.findOne.mockResolvedValue({
        id: 'user-1',
        deviceUuid: 'device-abc',
        permissions: ['READ incidents'],
        permissionVersion: 1,
      });

      const result = await service.assignRole(makeActor(), 'user-1', 'empty-role');

      expect(result.permissions).toEqual([]);
    });

    describe('rank/visibility check (T3.2 D9/D10 — assertCanManage before assignment)', () => {
      it('rejects 403 INSUFFICIENT_ROLE_RANK when the target user currently outranks the actor equally', async () => {
        const actor = makeActor({
          roleName: 'admin_organizacion',
          organizationId: 'org-A',
          scope: { kind: 'org', organizationId: 'org-A' },
        });
        // Destination role lookup, then the target's CURRENT role lookup.
        roleRepo.findOne
          .mockResolvedValueOnce({ id: 'role-new', name: 'reporter', permissions: [] })
          .mockResolvedValueOnce({ id: 'role-sys', name: 'admin_sistema' });
        userRepo.findOne.mockResolvedValue({
          id: 'target-1',
          organizationId: 'org-A',
          roleId: 'role-sys',
          deviceUuid: 'device-target',
          permissionVersion: 1,
        });

        await expect(
          service.assignRole(actor, 'target-1', 'role-new'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(userRepo.save).not.toHaveBeenCalled();
      });

      it('rejects 404 when the target user is not visible under the actor scope', async () => {
        const actor = makeActor({
          roleName: 'admin_organizacion',
          organizationId: 'org-A',
          scope: { kind: 'org', organizationId: 'org-A' },
        });
        roleRepo.findOne
          .mockResolvedValueOnce({ id: 'role-new', name: 'reporter', permissions: [] })
          .mockResolvedValueOnce({ id: 'role-op', name: 'operador_organizacion' });
        userRepo.findOne.mockResolvedValue({
          id: 'target-1',
          organizationId: 'org-B',
          roleId: 'role-op',
          deviceUuid: 'device-target',
          permissionVersion: 1,
        });

        await expect(
          service.assignRole(actor, 'target-1', 'role-new'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(userRepo.save).not.toHaveBeenCalled();
      });

      it('allows the assignment when the actor outranks a visible target', async () => {
        const actor = makeActor(); // admin_sistema, global
        roleRepo.findOne
          .mockResolvedValueOnce({ id: 'role-new', name: 'operador_organizacion', permissions: ['READ incidents'] })
          .mockResolvedValueOnce({ id: 'role-old', name: 'reporter' });
        userRepo.findOne.mockResolvedValue({
          id: 'target-1',
          organizationId: null,
          roleId: 'role-old',
          deviceUuid: 'device-target',
          permissionVersion: 1,
        });

        const result = await service.assignRole(actor, 'target-1', 'role-new');

        expect(result.roleId).toBe('role-new');
      });
    });

    describe('granted-role rank check (security/assign-role-rank-gap — assertCanGrantRole after assignment)', () => {
      it('rejects 403 INSUFFICIENT_ROLE_RANK when an admin_organizacion grants admin_sistema to a role-less user in its own org (the escalation)', async () => {
        const actor = makeActor({
          roleName: 'admin_organizacion',
          organizationId: 'org-A',
          scope: { kind: 'org', organizationId: 'org-A' },
        });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'admin_sistema',
          permissions: [],
        });
        userRepo.findOne.mockResolvedValue({
          id: 'target-1',
          organizationId: 'org-A',
          roleId: null,
          deviceUuid: 'device-target',
          permissionVersion: 1,
        });

        await expect(
          service.assignRole(actor, 'target-1', 'role-new'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(userRepo.save).not.toHaveBeenCalled();
      });

      it('rejects 403 when an admin_organizacion grants admin_organizacion (equal rank) to a role-less user in its own org', async () => {
        const actor = makeActor({
          roleName: 'admin_organizacion',
          organizationId: 'org-A',
          scope: { kind: 'org', organizationId: 'org-A' },
        });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'admin_organizacion',
          permissions: [],
        });
        userRepo.findOne.mockResolvedValue({
          id: 'target-1',
          organizationId: 'org-A',
          roleId: null,
          deviceUuid: 'device-target',
          permissionVersion: 1,
        });

        await expect(
          service.assignRole(actor, 'target-1', 'role-new'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(userRepo.save).not.toHaveBeenCalled();
      });

      it('allows an admin_organizacion to grant operador_organizacion to a role-less user in its own org', async () => {
        const actor = makeActor({
          roleName: 'admin_organizacion',
          organizationId: 'org-A',
          scope: { kind: 'org', organizationId: 'org-A' },
        });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'operador_organizacion',
          permissions: ['READ incidents'],
        });
        userRepo.findOne.mockResolvedValue({
          id: 'target-1',
          organizationId: 'org-A',
          roleId: null,
          deviceUuid: 'device-target',
          permissionVersion: 1,
        });

        const result = await service.assignRole(actor, 'target-1', 'role-new');

        expect(result.roleId).toBe('role-new');
      });

      it('rejects 403 when an admin_sistema grants admin_sistema (equal rank — no peer promotion)', async () => {
        const actor = makeActor({ roleName: 'admin_sistema', scope: { kind: 'global' } });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'admin_sistema',
          permissions: [],
        });
        userRepo.findOne.mockResolvedValue({
          id: 'target-1',
          organizationId: null,
          roleId: null,
          deviceUuid: 'device-target',
          permissionVersion: 1,
        });

        await expect(
          service.assignRole(actor, 'target-1', 'role-new'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(userRepo.save).not.toHaveBeenCalled();
      });

      it('allows an admin_sistema to grant admin_organizacion', async () => {
        const actor = makeActor({ roleName: 'admin_sistema', scope: { kind: 'global' } });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'admin_organizacion',
          permissions: [],
        });
        userRepo.findOne.mockResolvedValue({
          id: 'target-1',
          organizationId: null,
          roleId: null,
          deviceUuid: 'device-target',
          permissionVersion: 1,
        });

        const result = await service.assignRole(actor, 'target-1', 'role-new');

        expect(result.roleId).toBe('role-new');
      });

      it('allows an actor with roleName === null to grant any role (D2 additivity preserved)', async () => {
        const actor = makeActor({ roleName: null, scope: { kind: 'global' } });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'admin_sistema',
          permissions: [],
        });
        userRepo.findOne.mockResolvedValue({
          id: 'target-1',
          organizationId: 'org-A',
          roleId: null,
          deviceUuid: 'device-target',
          permissionVersion: 1,
        });

        const result = await service.assignRole(actor, 'target-1', 'role-new');

        expect(result.roleId).toBe('role-new');
      });
    });
  });

  // T7.2.C4 (R7.5) — soft delete, not a hard remove; must lock out every
  // currently-assigned user in the SAME operation via a permission_version
  // bump + cache invalidation (design D5).
  describe('delete (T7.2.B2/C4 — soft delete)', () => {
    it('soft-deletes the role (sets deletedAt) instead of removing the row', async () => {
      const role = { id: 'role-1', name: 'operator', permissions: [], deletedAt: null };
      roleRepo.findOne.mockResolvedValue(role);
      userRepo.find.mockResolvedValue([]);

      await service.delete('role-1');

      expect(roleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'role-1', deletedAt: expect.any(Date) }),
      );
    });

    it('throws NotFoundException for an unknown role id', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(roleRepo.save).not.toHaveBeenCalled();
    });

    it('bumps permission_version and invalidates the cache for every user still assigned to the role', async () => {
      const role = { id: 'role-1', name: 'operator', permissions: ['READ incidents'], deletedAt: null };
      roleRepo.findOne.mockResolvedValue(role);
      userRepo.find.mockResolvedValue([
        { id: 'user-1', deviceUuid: 'device-1', permissionVersion: 1 },
        { id: 'user-2', deviceUuid: null, permissionVersion: 3 },
      ]);

      await service.delete('role-1');

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', permissionVersion: 2 }),
      );
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-2', permissionVersion: 4 }),
      );
      expect(authService.invalidatePermissionCache).toHaveBeenCalledWith('user-1', 'device-1');
      expect(authService.invalidatePermissionCache).toHaveBeenCalledWith('user-2', null);
    });

    it('does not throw when no users are currently assigned to the role (idempotent-friendly)', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'empty', permissions: [], deletedAt: null });
      userRepo.find.mockResolvedValue([]);

      await expect(service.delete('role-1')).resolves.toBeUndefined();
      expect(userRepo.save).not.toHaveBeenCalled();
      expect(authService.invalidatePermissionCache).not.toHaveBeenCalled();
    });
  });

  // T7.2.C4 (R7.6) — a permission catalog row being soft-deleted must,
  // once recalculated, revoke that exact "ACTION resource" string from any
  // role that had it, and propagate to already-assigned users.
  describe('recalculateEffectivePermissions (T7.2.C4 — R7.6)', () => {
    it('drops a permission string whose catalog row is soft-deleted', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-1',
        name: 'operator',
        permissions: ['READ incidents', 'CREATE incidents'],
      });
      permissionRepo.find.mockResolvedValue([
        { resource: 'incidents', action: 'CREATE', deletedAt: new Date() },
      ]);
      userRepo.find.mockResolvedValue([]);

      const result = await service.recalculateEffectivePermissions('role-1');

      expect(result.permissions).toEqual(['READ incidents']);
      expect(roleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ permissions: ['READ incidents'] }),
      );
    });

    it('leaves permission strings untouched when no catalog row for them is soft-deleted', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-1',
        name: 'operator',
        permissions: ['READ incidents'],
      });
      permissionRepo.find.mockResolvedValue([]);
      userRepo.find.mockResolvedValue([]);

      const result = await service.recalculateEffectivePermissions('role-1');

      expect(result.permissions).toEqual(['READ incidents']);
      expect(roleRepo.save).not.toHaveBeenCalled();
    });

    it('propagates the revoked set to every user holding the role and bumps their permission_version', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-1',
        name: 'operator',
        permissions: ['READ incidents', 'CREATE incidents'],
      });
      permissionRepo.find.mockResolvedValue([
        { resource: 'incidents', action: 'CREATE', deletedAt: new Date() },
      ]);
      userRepo.find.mockResolvedValue([
        { id: 'user-1', deviceUuid: 'device-1', permissions: ['READ incidents', 'CREATE incidents'], permissionVersion: 1 },
      ]);

      await service.recalculateEffectivePermissions('role-1');

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          permissions: ['READ incidents'],
          permissionVersion: 2,
        }),
      );
      expect(authService.invalidatePermissionCache).toHaveBeenCalledWith('user-1', 'device-1');
    });

    it('throws NotFoundException for an unknown role id', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.recalculateEffectivePermissions('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
