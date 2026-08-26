import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';

import { RoleEntity } from '../../entities/role.entity';
import { UserEntity } from '../../entities/user.entity';
import { PermissionEntity } from '../../entities/permission.entity';
import { AuthContext } from '../../common/authz/subject-scope';
import { assertCanGrantRole, assertCanManage } from '../../common/authz/assert-can-manage';
import { formatPermissionString } from '../../common/decorators/require-permission.decorator';
import { AuthService } from '../auth/auth.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

/**
 * RolesService (R6/R7) — formalizes design D2/D3 groundwork from T1.4.
 *
 * Permissions attach to a role as a flat "ACTION resource" string array
 * (same shape PermissionGuard already compares — no separate DSL). Role
 * assignment denormalizes that array onto the target user's own
 * `permissions` column (what AuthService.getPermissions/
 * getPermissionsByUserId actually read) and bumps `permission_version`
 * (design D2's `pv`) so a stale cached Redis blob can be told apart from a
 * fresh one — then invalidates that cache directly via
 * AuthService.invalidatePermissionCache, rather than reissuing tokens.
 */
@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    private readonly dataSource: DataSource,
    private readonly authService: AuthService,
  ) {}

  /**
   * Returns the permission strings composed by a role. A role that exists
   * but grants nothing resolves to `[]` (R6) — PermissionGuard's
   * default-deny then does the actual denying, not this method.
   */
  async listPermissions(roleId: string): Promise<string[]> {
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }
    return role.permissions ?? [];
  }

  /**
   * Assigns `roleId` to `userId`: denormalizes the role's permission set
   * onto the user row, bumps `permission_version`, and invalidates both
   * cached permission keys (device_uuid-keyed and uid-keyed) so the very
   * next request reflects the new role instead of a TTL-stale one.
   *
   * `assertCanManage` (T3.2 design D9/D10) runs BEFORE the write, against
   * the target's CURRENT role (not the destination one) — 404 if the
   * target is invisible under the actor's scope, 403
   * `INSUFFICIENT_ROLE_RANK` if visible but the actor does not outrank
   * them.
   *
   * `assertCanGrantRole` runs immediately after, against the role being
   * GRANTED — closes the privilege-escalation gap where a role-less
   * target (`rankOf = MAX_SAFE_INTEGER`) always passed the check above
   * regardless of which role the actor was about to hand out
   * (security/assign-role-rank-gap). Ordered after `assertCanManage` so a
   * target the actor cannot even see still yields 404, not 403 (D11).
   */
  async assignRole(actor: AuthContext, userId: string, roleId: string): Promise<UserEntity> {
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const currentRole = user.roleId
      ? await this.roleRepo.findOne({ where: { id: user.roleId } })
      : null;
    assertCanManage(actor, {
      id: user.id,
      organizationId: user.organizationId,
      roleName: currentRole?.name ?? null,
    });
    assertCanGrantRole(actor, role.name ?? null);

    user.roleId = role.id;
    user.permissions = role.permissions ?? [];
    user.permissionVersion = (user.permissionVersion ?? 1) + 1;

    const saved = await this.userRepo.save(user);
    await this.authService.invalidatePermissionCache(saved.id, saved.deviceUuid);
    return saved;
  }

  // ---- T5.6 CRUD: list / show / create / update / delete / syncPermissions

  /** T7.2.B2 — soft-deleted roles are excluded from the admin listing. */
  async findAll(): Promise<RoleEntity[]> {
    return this.roleRepo.find({ where: { deletedAt: IsNull() }, order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<RoleEntity> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    return role;
  }

  async create(dto: CreateRoleDto): Promise<RoleEntity> {
    const role = this.roleRepo.create({
      name: dto.name,
      permissions: dto.permissions ?? [],
    });
    return this.roleRepo.save(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleEntity> {
    const role = await this.findOne(id);
    if (dto.name !== undefined) {
      role.name = dto.name;
    }
    if (dto.permissions !== undefined) {
      role.permissions = dto.permissions;
    }
    return this.roleRepo.save(role);
  }

  /**
   * T7.2.C4 (R7.5, design D5) — soft delete, NOT a hard remove. A role can
   * be soft-deleted even with users still assigned (that is the whole
   * point: those users must lose access immediately, not be blocked as an
   * orphan-prevention measure the way a hard delete would need to be).
   * `AuthService.getAuthContextByUserId` independently zeroes out
   * permissions for a soft-deleted role on every fresh (post-cache) read;
   * this method's own job is to force that freshness NOW by bumping
   * `permission_version` and invalidating the Redis cache for every
   * affected user in the same operation (design D5's explicit-invalidation
   * model — soft-deleting a row never invalidates anything by itself).
   * Idempotent: soft-deleting an already-deleted role just re-stamps
   * `deletedAt` and re-invalidates (204, no error).
   */
  async delete(id: string): Promise<void> {
    const role = await this.findOne(id);
    role.deletedAt = new Date();
    await this.roleRepo.save(role);

    const affectedUsers = await this.userRepo.find({ where: { roleId: id } });
    await Promise.all(
      affectedUsers.map(async (user) => {
        user.permissionVersion = (user.permissionVersion ?? 1) + 1;
        await this.userRepo.save(user);
        await this.authService.invalidatePermissionCache(user.id, user.deviceUuid);
      }),
    );
  }

  /**
   * T7.2.C4 (R7.6) — re-derives a role's effective permission set by
   * dropping any permission string whose (resource, action) pair matches a
   * SOFT-DELETED row in the `permissions` catalog. Strings with no
   * corresponding catalog row at all are left untouched (design D3: the
   * catalog is informational, not authoritative — PermissionGuard never
   * queries it directly), so this only ever *revokes*, never invents.
   * No-ops (skips the user fan-out entirely) when nothing was actually
   * revoked.
   */
  async recalculateEffectivePermissions(id: string): Promise<RoleEntity> {
    const role = await this.findOne(id);
    const deletedPermissions = await this.permissionRepo.find({
      where: { deletedAt: Not(IsNull()) },
    });
    const revoked = new Set(
      deletedPermissions.map((p) => formatPermissionString(p.action, p.resource)),
    );

    const before = role.permissions ?? [];
    const after = before.filter((p) => !revoked.has(p));
    if (after.length === before.length) {
      return role;
    }

    role.permissions = after;
    const saved = await this.roleRepo.save(role);

    const affectedUsers = await this.userRepo.find({ where: { roleId: id } });
    await Promise.all(
      affectedUsers.map(async (user) => {
        user.permissions = after;
        user.permissionVersion = (user.permissionVersion ?? 1) + 1;
        await this.userRepo.save(user);
        await this.authService.invalidatePermissionCache(user.id, user.deviceUuid);
      }),
    );

    return saved;
  }

  /**
   * PUT semantics: REPLACE the role's permission set in a single
   * transaction. Returns the updated role so the controller can show
   * the new state without an extra GET.
   */
  async syncPermissions(id: string, permissions: string[]): Promise<RoleEntity> {
    const role = await this.findOne(id);
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RoleEntity);
      role.permissions = permissions;
      return repo.save(role);
    });
  }
}
