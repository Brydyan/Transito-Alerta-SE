import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { RolesService } from './roles.service';
import { RoleEntity } from '../../entities/role.entity';
import { UserEntity } from '../../entities/user.entity';
import { AuthService } from '../auth/auth.service';

describe('RolesService', () => {
  let roleRepo: { findOne: jest.Mock };
  let userRepo: { findOne: jest.Mock; save: jest.Mock };
  let authService: { invalidatePermissionCache: jest.Mock };
  let service: RolesService;

  beforeEach(() => {
    roleRepo = { findOne: jest.fn() };
    userRepo = { findOne: jest.fn(), save: jest.fn(async (x) => x) };
    authService = { invalidatePermissionCache: jest.fn() };
    service = new RolesService(roleRepo as unknown as jest.Mocked<Repository<RoleEntity>>, userRepo as unknown as jest.Mocked<Repository<UserEntity>>, authService as unknown as jest.Mocked<AuthService>);
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

      await expect(service.assignRole('user-1', 'ghost-role')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', permissions: ['READ incidents'] });
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.assignRole('ghost-user', 'role-1')).rejects.toBeInstanceOf(
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

      const result = await service.assignRole('user-1', 'role-1');

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

      await service.assignRole('user-1', 'role-1');

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

      const result = await service.assignRole('user-1', 'empty-role');

      expect(result.permissions).toEqual([]);
    });
  });
});
