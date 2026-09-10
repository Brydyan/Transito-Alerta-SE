import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull, Not, type Repository } from 'typeorm';
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
    roleName: 'master',
    scope: { kind: 'global' },
    sessionId: 'session-admin-1',
    isAnonymous: false,
    ...overrides,
  };
}

function mockRole(name: string) {
  return { id: 'role-1', name, permissions: [] } as unknown as RoleEntity;
}

describe('RolesService', () => {
  let roleRepo: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock; create: jest.Mock };
  let userRepo: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock; count: jest.Mock };
  let permissionRepo: { find: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let authService: { invalidatePermissionCache: jest.Mock };
  let service: RolesService;

  beforeEach(() => {
    roleRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      // AUD FIX-5 (ronda 12): `create()` llama a
      // `this.roleRepo.create({...})` antes de save. El
      // mock anterior no lo proveía, así que el
      // spec del camino feliz fallaba con
      // "this.roleRepo.create is not a function". El mock
      // implementa el contrato estándar de TypeORM:
      // `create(input)` devuelve una entidad sin persistir
      // (es una función de "construcción", no de "save").
      create: jest.fn().mockImplementation((x: unknown) => x),
      save: jest.fn(async (x) => x),
    };
    userRepo = { findOne: jest.fn(), find: jest.fn(async () => []), save: jest.fn(async (x) => x), count: jest.fn() };
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

  // Change `2026-09-09-roles-stats-endpoint` — métricas agregadas
  // para las 3 cards del pie de `/app/admin/roles` (mock 04-01).
  // El método es on-the-fly (sin cache, D1 del design).
  describe('getStats', () => {
    it('returns totalPermissions / protectedModules / assignedUsers for live rows, collapsing duplicates via Set', async () => {
      // 2 roles vivos con permission strings superpuestos:
      //   - r1: 3 strings únicos
      //   - r2: 4 strings, 1 duplicado de r1 ('READ users')
      // Total únicos esperados: 3 + 3 = 6.
      // Recursos distintos: 'users' y 'incidents' = 2.
      roleRepo.find.mockResolvedValueOnce([
        { id: 'r1', permissions: ['READ users', 'CREATE users', 'UPDATE incidents'] },
        { id: 'r2', permissions: ['READ users', 'DELETE users', 'CREATE incidents', 'UPDATE roles'] },
      ] as unknown as RoleEntity[]);
      userRepo.count.mockResolvedValueOnce(85);

      const result = await service.getStats();

      expect(roleRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: IsNull() }, select: ['id', 'permissions'] }),
      );
      expect(userRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { roleId: Not(IsNull()), deletedAt: IsNull() } }),
      );
      expect(result).toEqual({
        totalPermissions: 6,  // 'READ users' colapsa via Set
        protectedModules: 3,  // users, incidents, roles
        assignedUsers: 85,
      });
    });

    it('returns zeros when there are no live roles', async () => {
      roleRepo.find.mockResolvedValueOnce([]);
      userRepo.count.mockResolvedValueOnce(0);

      const result = await service.getStats();

      expect(result).toEqual({
        totalPermissions: 0,
        protectedModules: 0,
        assignedUsers: 0,
      });
    });

    it('counts 0 totalPermissions / 0 protectedModules for roles with empty permissions', async () => {
      roleRepo.find.mockResolvedValueOnce([
        { id: 'r1', permissions: [] },
        { id: 'r2', permissions: [] },
      ] as unknown as RoleEntity[]);
      userRepo.count.mockResolvedValueOnce(2);

      const result = await service.getStats();

      expect(result).toEqual({
        totalPermissions: 0,
        protectedModules: 0,
        assignedUsers: 2,
      });
    });

    it('ignores malformed permission strings for protectedModules but still counts them in totalPermissions', async () => {
      roleRepo.find.mockResolvedValueOnce([
        { id: 'r1', permissions: ['READ users', 'malformed', 'UPDATE incidents'] },
      ] as unknown as RoleEntity[]);
      userRepo.count.mockResolvedValueOnce(1);

      const result = await service.getStats();

      // 'malformed' cuenta en totalPermissions (Set lo acepta como
      // string único) pero NO en protectedModules (split no da 2 parts).
      expect(result.totalPermissions).toBe(3);
      expect(result.protectedModules).toBe(2); // users, incidents
      expect(result.assignedUsers).toBe(1);
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
          roleName: 'admin_org',
          organizationId: 'org-A',
          scope: { kind: 'org', organizationId: 'org-A' },
        });
        // Destination role lookup, then the target's CURRENT role lookup.
        roleRepo.findOne
          .mockResolvedValueOnce({ id: 'role-new', name: 'reporter', permissions: [] })
          .mockResolvedValueOnce({ id: 'role-sys', name: 'master' });
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
          roleName: 'admin_org',
          organizationId: 'org-A',
          scope: { kind: 'org', organizationId: 'org-A' },
        });
        roleRepo.findOne
          .mockResolvedValueOnce({ id: 'role-new', name: 'reporter', permissions: [] })
          .mockResolvedValueOnce({ id: 'role-op', name: 'operador_org' });
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
          .mockResolvedValueOnce({ id: 'role-new', name: 'operador_org', permissions: ['READ incidents'] })
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
          roleName: 'admin_org',
          organizationId: 'org-A',
          scope: { kind: 'org', organizationId: 'org-A' },
        });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'master',
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
          roleName: 'admin_org',
          organizationId: 'org-A',
          scope: { kind: 'org', organizationId: 'org-A' },
        });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'admin_org',
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
          roleName: 'admin_org',
          organizationId: 'org-A',
          scope: { kind: 'org', organizationId: 'org-A' },
        });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'operador_org',
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
        const actor = makeActor({ roleName: 'master', scope: { kind: 'global' } });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'master',
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
        const actor = makeActor({ roleName: 'master', scope: { kind: 'global' } });
        roleRepo.findOne.mockResolvedValueOnce({
          id: 'role-new',
          name: 'admin_org',
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
          name: 'master',
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

  // AUD (sc-327) WARNING-1 (ronda 11) — `REVEAL incidents`
  // se reserva a `master`. La revelación abre un agujero
  // serio: la fila de `incident_reporters` muestra el id
  // real del autor de un reporte anónimo, y ese id es lo
  // que el master usa para abrir una investigación. Si un
  // admin_org o un reportero lograra añadir `REVEAL
  // incidents` a su set, el aislamiento entre staff
  // jerárquicamente separado se rompe. Por eso la
  // comprobación se hace ANTES de la transacción, no
  // después — no debe quedar un UPDATE parcial si la
  // lógica rechaza.
  describe('syncPermissions (AUD WARNING-1 — REVEAL is master-only)', () => {
    it('master puede incluir REVEAL incidents en su set', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole('master'));

      const result = await service.syncPermissions('role-1', [
        'REVEAL incidents',
        'READ incidents',
      ]);

      expect(result.permissions).toEqual([
        'REVEAL incidents',
        'READ incidents',
      ]);
    });

    it('admin_org NO puede incluir REVEAL incidents → BadRequestException con code REVEAL_NOT_GRANTABLE', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole('admin_org'));

      await expect(
        service.syncPermissions('role-1', ['REVEAL incidents', 'READ incidents']),
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: 'REVEAL_NOT_GRANTABLE' }),
      });
      // Sin transacción — la BD no se tocó.
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('operador_org NO puede incluir REVEAL incidents → BadRequestException', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole('operador_org'));

      await expect(
        service.syncPermissions('role-1', ['REVEAL incidents']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reporter NO puede incluir REVEAL incidents → BadRequestException', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole('reporter'));

      await expect(
        service.syncPermissions('role-1', ['REVEAL incidents']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un rol nuevo (e.g. "auditor") NO puede incluir REVEAL incidents → BadRequestException', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole('auditor'));

      await expect(
        service.syncPermissions('role-1', ['REVEAL incidents']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('roles no-master pueden tener cualquier permiso que NO sea REVEAL incidents', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole('operador_org'));

      const result = await service.syncPermissions('role-1', [
        'READ incidents',
        'UPDATE incidents',
      ]);

      expect(result.permissions).toEqual([
        'READ incidents',
        'UPDATE incidents',
      ]);
    });
  });

  // AUD FIX-5 (ronda 12) — `create()` también debe rechazar
  // REVEAL incidents para roles no-master. El guard estaba
  // sólo en `syncPermissions`, así que `create()` aceptaba
  // silenciosamente `{name: 'auditor', permissions:
  // ['REVEAL incidents']}`. El escenario de la spec
  // "No se concede por descuido" lo cubría para 1 de 3
  // puntos de mutación; esta ronda lo cierra para los 3.
  describe('create (AUD FIX-5)', () => {
    it('rechaza REVEAL incidents en un rol no-master con BadRequestException + code REVEAL_NOT_GRANTABLE', async () => {
      await expect(
        service.create({
          name: 'auditor',
          permissions: ['REVEAL incidents'],
        } as never),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'REVEAL_NOT_GRANTABLE' }),
      });
      // No persistió.
      expect(roleRepo.save).not.toHaveBeenCalled();
    });

    it('acepta REVEAL incidents cuando el nombre es "master"', async () => {
      // Espejo del test que ya existe para `syncPermissions`,
      // aplicado a `create`. Si alguien cambia el nombre a
      // 'Master' (mayúscula inicial) o 'MASTER', el test cae —
      // el match es exacto, no case-insensitive.
      roleRepo.save.mockResolvedValue({
        id: 'role-new',
        name: 'master',
        permissions: ['REVEAL incidents'],
      } as never);

      const result = await service.create({
        name: 'master',
        permissions: ['REVEAL incidents'],
      } as never);

      expect(result.permissions).toEqual(['REVEAL incidents']);
    });

    it('roles no-master pueden crearse con permisos que NO incluyen REVEAL', async () => {
      roleRepo.save.mockResolvedValue({
        id: 'role-1',
        name: 'auditor',
        permissions: ['READ incidents'],
      } as never);

      const result = await service.create({
        name: 'auditor',
        permissions: ['READ incidents'],
      } as never);

      expect(result.permissions).toEqual(['READ incidents']);
    });
  });

  // AUD FIX-5 (ronda 12) — `update()` también debe rechazar.
  // Esto es crítico porque la spec exige la invariante
  // "ningún rol distinto de master tiene REVEAL incidents"
  // sobre TODA mutación de `roles.permissions`, no sólo
  // sobre `syncPermissions`.
  describe('update (AUD FIX-5)', () => {
    it('rechaza añadir REVEAL incidents a un rol no-master existente', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole('admin_org'));

      await expect(
        service.update('role-1', { permissions: ['READ incidents', 'REVEAL incidents'] } as never),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'REVEAL_NOT_GRANTABLE' }),
      });
      // No persistió.
      expect(roleRepo.save).not.toHaveBeenCalled();
    });

    it('acepta añadir REVEAL incidents a un rol master', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole('master'));
      // `save` devuelve la entidad que recibió (con las
      // permissions nuevas). Si el mock devolviera un
      // `mockRole('master')` con `permissions: []` "fresco",
      // el assert caería con la forma vacía y el spec diría
      // que la mutación se perdió, lo cual es un test
      // que miente: la mutación sí se hizo, es el mock el
      // que no la refleja.
      roleRepo.save.mockImplementation(async (x) => x as never);

      const result = await service.update('role-1', { permissions: ['REVEAL incidents'] } as never);

      expect(result.permissions).toEqual(['REVEAL incidents']);
    });
  });

  // AUD FIX-6 (ronda 12) — el guard se apoyaba en
  // `role.name`, pero `update()` permite renombrar. El
  // camino de ataque: PATCH /roles/:id {name:'master'}
  // (acepta), seguido de PUT /roles/:id/permissions
  // ['REVEAL incidents'] (acepta porque role.name ahora es
  // 'master'). El guard tiene que evaluar con el nombre
  // RESULTANTE del dto, no con el actual. Y los nombres
  // sembrados son identificadores funcionales, no
  // etiquetas cosméticas — no se puede renombrar hacia
  // ni desde ese conjunto.
  describe('update (AUD FIX-6 — REVEAL evalúa nombre resultante + rename protection)', () => {
    it('rechaza el PATCH atómico (rename a master + añadir REVEAL) con REVEAL_NOT_GRANTABLE', async () => {
      // El camino de ataque. role.name actual = 'reporter'.
      // dto dice name='master' + permissions incluye
      // REVEAL incidents. El guard con el nombre RESULTANTE
      // ('master') + permissions que incluyen REVEAL pasa
      // la primera condición; entonces el spec de rename
      // rechaza el renombrado al nombre sembrado. Y la
      // primera línea del método (`this.assertRevealOnlyForMaster
      // (resultingName, resultingPermissions)`) NO rechaza
      // porque resultingName === 'master'. El orden importa:
      // rename protection va ANTES de save, y la lógica
      // resultante evalúa correctamente.
      roleRepo.findOne.mockResolvedValue(mockRole('reporter'));

      await expect(
        service.update('role-1', {
          name: 'master',
          permissions: ['REVEAL incidents'],
        } as never),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SEEDED_ROLE_RENAME_FORBIDDEN' }),
      });
      expect(roleRepo.save).not.toHaveBeenCalled();
    });

    it('rechaza renombrar un rol sembrado (reporter → master) por sí solo, sin permisos', async () => {
      // Un solo campo del dto no esquiva el guard.
      roleRepo.findOne.mockResolvedValue(mockRole('reporter'));

      await expect(
        service.update('role-1', { name: 'master' } as never),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SEEDED_ROLE_RENAME_FORBIDDEN' }),
      });
    });

    it('rechaza renombrar un rol sembrado HACIA otro nombre sembrado (master → reporter)', async () => {
      // El camino "no me conviene ser master, prefiero ser
      // reporter". La razón técnica: las migraciones
      // conceden por nombre, y `master` tiene REVEAL
      // incidents (0047); si renombramos a 'reporter',
      // perdemos la garantía de que REVEAL se queda en
      // master.
      roleRepo.findOne.mockResolvedValue(mockRole('master'));

      await expect(
        service.update('role-1', { name: 'reporter' } as never),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SEEDED_ROLE_RENAME_FORBIDDEN' }),
      });
    });

    it('rechaza renombrar a admin_org', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole('auditor'));

      await expect(
        service.update('role-1', { name: 'admin_org' } as never),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SEEDED_ROLE_RENAME_FORBIDDEN' }),
      });
    });

    it('permite renombrar roles no-sembrados a otros nombres no-sembrados', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole('auditor'));
      roleRepo.save.mockResolvedValue(mockRole('auditor-v2'));

      const result = await service.update('role-1', { name: 'auditor-v2' } as never);

      expect(result.name).toBe('auditor-v2');
    });
  });
});
