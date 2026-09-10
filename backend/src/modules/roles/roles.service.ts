import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { RoleStatsDto } from './dto/role-stats.dto';

/**
 * AUD (sc-327) FIX-6 (ronda 12) — nombres de roles sembrados
 * por las migraciones. Una migración 0015 los siembra
 * con sus nombres largos (`admin_organizacion`,
 * `operador_organizacion`) y la 0047 los renombra a
 * `admin_org` / `operador_org`. El conjunto FINAL —el que
 * el código de runtime ve— es este. Tratarlos como
 * identificadores, no como etiquetas, es lo que el FIX-6
 * exige: las migraciones conceden permisos por nombre, así
 * que un nombre sembrado tiene significado funcional, no
 * cosmético. Renombrar `reporter` a `master` en un PATCH
 * sería el primer paso de un privilege-escalation silencioso.
 */
const SEEDED_ROLE_NAMES: ReadonlySet<string> = new Set([
  'master',
  'admin_org',
  'operador_org',
  'operador_sistema',
  'reporter',
]);

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

  /**
   * Change `2026-09-09-roles-stats-endpoint` — métricas agregadas para
   * las 3 cards del pie de `/app/admin/roles` (mock 04-01).
   *
   * Cálculo on-the-fly (D1): dos queries simples, sin cache. Excluye
   * soft-deleted de ambas tablas (D3 — coherente con `findAll` arriba).
   * Los permission strings duplicados entre roles colapsan vía `Set`
   * (D4 — el spec cuenta cada combinación única una sola vez).
   *
   * Si el formato del permission string cambia en el futuro, este
   * parser (`split(' ')`) debe actualizarse en lockstep con T3.1.
   */
  async getStats(): Promise<RoleStatsDto> {
    const roles = await this.roleRepo.find({
      where: { deletedAt: IsNull() },
      select: ['id', 'permissions'],
    });

    const allPerms = new Set<string>();
    const modules = new Set<string>();
    for (const role of roles) {
      for (const perm of role.permissions ?? []) {
        allPerms.add(perm);
        const parts = perm.split(' ');
        if (parts.length === 2) {
          modules.add(parts[1]);
        }
      }
    }

    const assignedUsers = await this.userRepo.count({
      where: { roleId: Not(IsNull()), deletedAt: IsNull() },
    });

    return {
      totalPermissions: allPerms.size,
      protectedModules: modules.size,
      assignedUsers,
    };
  }

  async create(dto: CreateRoleDto): Promise<RoleEntity> {
    // AUD FIX-5/FIX-6 (ronda 12) — el guard que vivía sólo en
    // `syncPermissions` ahora cubre los tres puntos de
    // mutación: `create`, `update`, `syncPermissions`. La
    // comparación contra `name` exige evaluar el nombre
    // RESULTANTE, no el actual — en `update`, si el dto trae
    // un `name` nuevo, ése es el que cuenta.
    this.assertRevealOnlyForMaster(dto.name, dto.permissions ?? []);
    const role = this.roleRepo.create({
      name: dto.name,
      permissions: dto.permissions ?? [],
    });
    return this.roleRepo.save(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleEntity> {
    const role = await this.findOne(id);

    // FIX-6 (ronda 12) — el nombre RESULTANTE (post-dto.name)
    // y los permisos RESULTANTES (post-dto.permissions) son
    // los que pasan al guard. Sin esto, un `PATCH` que
    // renombre a `master` y conceda `REVEAL incidents` en la
    // misma request pasaba porque `syncPermissions` evaluaba
    // contra el nombre actual, y el siguiente `PUT
    // /permissions` ya veía `role.name = 'master'`.
    const resultingName = dto.name ?? role.name;
    const resultingPermissions =
      dto.permissions !== undefined ? dto.permissions : role.permissions ?? [];
    this.assertRevealOnlyForMaster(resultingName, resultingPermissions);

    // FIX-6 — los nombres de roles sembrados son
    // identificadores funcionales, no etiquetas. No se
    // permite renombrar HACIA ni DESDE ese conjunto.
    if (dto.name !== undefined && dto.name !== role.name) {
      this.assertSeededNameNotRenamed(role.name, dto.name);
    }

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
   *
   * AUD (sc-327) WARNING-1/FIX-5 (rondas 11/12):
   * `REVEAL incidents` es un permiso exclusivo de `master`
   * (D5 del diseño). Un admin_org, operador, reporter o un
   * rol nuevo no pueden tenerlo. Si un rol intenta
   * incluirlo en `syncPermissions`, se rechaza con 400 —
   * antes de la transacción, para que no quede un UPDATE
   * parcial. La forma de la aserción es `(roleName,
   * permissions)`, no `(RoleEntity, permissions)`, para que
   * `create()` pueda llamarla sin construir una entidad falsa.
   */
  async syncPermissions(id: string, permissions: string[]): Promise<RoleEntity> {
    const role = await this.findOne(id);
    this.assertRevealOnlyForMaster(role.name, permissions);
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RoleEntity);
      role.permissions = permissions;
      return repo.save(role);
    });
  }

  /**
   * AUD WARNING-1/FIX-5: `REVEAL incidents` se reserva a
   * `master` (D5). Esta forma de la aserción recibe
   * `(roleName, permissions)` — separada de la entidad
   * para que `create()` (que no tiene `RoleEntity`) pueda
   * usarla directamente, y para que `update()` evalúe con
   * el nombre RESULTANTE (post-dto.name) en vez del actual.
   */
  private assertRevealOnlyForMaster(
    roleName: string | null,
    permissions: readonly string[] | undefined,
  ): void {
    const wantsReveal = (permissions ?? []).includes('REVEAL incidents');
    if (wantsReveal && roleName !== 'master') {
      throw new BadRequestException({
        code: 'REVEAL_NOT_GRANTABLE',
        message:
          `REVEAL incidents is reserved for the master role; role '${roleName ?? '<unnamed>'}' cannot hold it.`,
      });
    }
  }

  /**
   * AUD FIX-6 (ronda 12) — los nombres de roles sembrados
   * son identificadores funcionales, no etiquetas. Las
   * migraciones conceden permisos por nombre; un rename
   * es por tanto una operación con privilegio y debe
   * rechazarse tanto HACIA un nombre sembrado (`reporter`
   * → `master` es el primer paso de un privilege-escalation
   * silencioso, demostrado por el camino `PATCH /roles/:id
   * {name:'master'}` + `PUT /roles/:id/permissions
   * ['REVEAL incidents']`), como DESDE un nombre sembrado
   * (un rename `master` → `master-of-anything` rompe
   * cualquier futuro `WHERE name = 'master'` que el
   * catálogo de migraciones use, y deja huérfana la
   * concesión de `REVEAL incidents` hecha por 0047).
   */
  private assertSeededNameNotRenamed(
    currentName: string | null,
    nextName: string,
  ): void {
    if (currentName === nextName) {
      return;
    }
    const currentIsSeeded =
      currentName !== null && SEEDED_ROLE_NAMES.has(currentName);
    const nextIsSeeded = SEEDED_ROLE_NAMES.has(nextName);
    if (currentIsSeeded || nextIsSeeded) {
      const seededList = Array.from(SEEDED_ROLE_NAMES).join(', ');
      const from = currentName ?? '<null>';
      throw new BadRequestException({
        code: 'SEEDED_ROLE_RENAME_FORBIDDEN',
        message:
          `Renaming a seeded role name is forbidden. ` +
          `Seeded names: ${seededList}. ` +
          `Got: '${from}' -> '${nextName}'.`,
      });
    }
  }
}
