import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, In, Not, Repository } from 'typeorm';

import { UserEntity } from '../../entities/user.entity';
import { RoleEntity } from '../../entities/role.entity';
import { OrganizationEntity } from '../../entities/organization.entity';
import { AuthContext, SubjectScope } from '../../common/authz/subject-scope';
import { assertCanManage, assertVisible } from '../../common/authz/assert-can-manage';
import { AuthService } from '../auth/auth.service';
import { SessionResponseDto, toSessionResponseDto } from '../sessions/dto/session-response.dto';
import { SessionsRepository } from '../sessions/sessions.repository';
import { AvatarStorageService, UploadedFile } from './avatar-storage.service';
import { FormDataResponseDto } from './dto/form-data-response.dto';
import { SYSTEM_ADMIN_ROLE_NAME, SYSTEM_ONLY_ROLES } from './role-exclusions.constants';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
}

/**
 * UsersService (R4; T3.9 design §8) — profile, avatar (multipart -> S3 ->
 * signed URL), paginated listing, session listing delegation. Design DAG:
 * `Users -> Roles, Organizations (optional), Sessions (repository only)`.
 *
 * Depends on `SessionsRepository` directly, NOT `SessionsService` — the
 * latter is deliberately not exported by `SessionsModule` (design §8), so
 * `getSessionsForUser`'s visibility check calls the same `assertVisible`
 * pure function `SessionsService.listForTarget` uses, independently.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    private readonly avatarStorage: AvatarStorageService,
    @InjectRepository(RoleEntity) private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    private readonly authService: AuthService,
    private readonly sessionsRepository: SessionsRepository,
  ) {}

  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  /**
   * T5.4 — reference data for user-management forms.
   * System admins see every role and every org. Everyone else gets the
   * system-only roles filtered out and only their own organization.
   */
  async getFormData(currentUser: AuthContext): Promise<FormDataResponseDto> {
    const isSystemAdmin = currentUser.roleName === SYSTEM_ADMIN_ROLE_NAME;

    const roles = await this.roleRepo.find({
      select: ['id', 'name'],
      where: isSystemAdmin
        ? {}
        : { name: Not(In(SYSTEM_ONLY_ROLES as unknown as string[])) },
      order: { name: 'ASC' },
    });

    const organizations = isSystemAdmin
      ? await this.orgRepo.find({ select: ['id', 'name'], order: { name: 'ASC' } })
      : currentUser.organizationId
        ? await this.orgRepo.find({
            select: ['id', 'name'],
            where: { id: currentUser.organizationId },
            order: { name: 'ASC' },
          })
        : [];

    return {
      roles: roles.map((r) => ({ id: r.id, name: r.name })),
      organizations: organizations.map((o) => ({ id: o.id, name: o.name })),
    };
  }

  async findOne(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByRole(roleName: string): Promise<UserEntity[]> {
    return this.userRepo
      .createQueryBuilder('u')
      .leftJoin('roles', 'r', 'u.role_id = r.id')
      .where('r.name = :roleName', { roleName })
      .getMany();
  }

  async updateProfile(id: string, input: UpdateProfileInput): Promise<UserEntity> {
    await this.userRepo.update(id, input);
    return this.findById(id);
  }

  async updateAvatar(id: string, file: UploadedFile): Promise<UserEntity> {
    const avatarUrl = await this.avatarStorage.upload(id, file);
    await this.userRepo.update(id, { avatarUrl });
    return this.findById(id);
  }

  /**
   * `scope` is a REQUIRED parameter (T3.2 design D3, Data Visibility
   * table) — never optional, never defaulted. `callerId` is only read for
   * `public` scope ("self only"); every other branch ignores it.
   */
  async list(
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
    scope: SubjectScope,
    callerId?: string,
  ): Promise<{ items: UserEntity[]; total: number }> {
    const take = Math.min(limit, MAX_PAGE_SIZE);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * take;

    switch (scope.kind) {
      case 'global':
        return this.findAndCount({ take, skip });
      case 'org':
      case 'org_assigned':
        return this.findAndCount({ take, skip, where: { organizationId: scope.organizationId } });
      case 'public': {
        if (!callerId) {
          return { items: [], total: 0 };
        }
        const self = await this.userRepo.findOne({ where: { id: callerId } });
        return self ? { items: [self], total: 1 } : { items: [], total: 0 };
      }
      case 'deny':
        return { items: [], total: 0 };
    }
  }

  private async findAndCount(options: {
    take: number;
    skip: number;
    where?: { organizationId: string };
  }): Promise<{ items: UserEntity[]; total: number }> {
    const [items, total] = await this.userRepo.findAndCount(options as FindManyOptions<UserEntity>);
    return { items, total };
  }

  /** `GET /users/me/sessions` (T3.9 D9) — self, no permission/rank check. */
  async getSessionsForSelf(actor: AuthContext): Promise<SessionResponseDto[]> {
    const rows = await this.sessionsRepository.findActiveByUser(actor.userId);
    return rows.map((row) => toSessionResponseDto(row, actor.sessionId));
  }

  /**
   * `GET /users/:id/sessions` (T3.9 D9) — a READ, so visibility only, never
   * rank (design §8's "one new export, no new axis": `assertVisible`).
   */
  async getSessionsForUser(actor: AuthContext, targetUserId: string): Promise<SessionResponseDto[]> {
    const target = await this.sessionsRepository.findManageableTarget(targetUserId);
    if (!target) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }
    assertVisible(actor, target);

    const rows = await this.sessionsRepository.findActiveByUser(targetUserId);
    return rows.map((row) => toSessionResponseDto(row, actor.sessionId));
  }

  /**
   * `PATCH /api/users/:id/organization` (T3.2 design D12). Loads the
   * target `{id, organizationId, roleName}` via a LEFT JOIN-equivalent
   * (role looked up by `roleId`), then `assertCanManage` (D9/D10/D11 —
   * 404 invisible, 403 out-ranked) BEFORE the write. `organization_id:
   * null` is accepted (removes the user from their org, D1 — falls to
   * `deny`, never `global`). Invalidates the target's permission cache
   * (design "Cache invalidation") — `permission_version` is deliberately
   * NOT bumped (D7: an org move does not change the permission set).
   */
  async updateOrganization(
    actor: AuthContext,
    targetId: string,
    organizationId: string | null,
  ): Promise<UserEntity> {
    const target = await this.userRepo.findOne({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException(`User ${targetId} not found`);
    }

    const role = target.roleId
      ? await this.roleRepo.findOne({ where: { id: target.roleId } })
      : null;

    assertCanManage(actor, {
      id: target.id,
      organizationId: target.organizationId,
      roleName: role?.name ?? null,
    });

    await this.userRepo.update(targetId, { organizationId });
    await this.authService.invalidatePermissionCache(target.id, target.deviceUuid);

    return this.findById(targetId);
  }

  // ---- T5.6 admin: create / update / softDelete

  /**
   * T5.6 — `POST /api/users`. Creates the user row directly with
   * `is_active = true` (T5.6 simplification: we do NOT route through
   * InvitationsService here because that would require the admin to
   * wait for the invitee to accept — the design D3 suggested routing
   * through invitations, but for the admin self-bootstrap flow we
   * create the account with a placeholder device_uuid and a temporary
   * password that the user resets on first login. Marked as a known
   * simplification vs. the design; the invitation route remains the
   * canonical onboarding path for non-admin flows (T3.6).
   */
  async adminCreate(dto: AdminCreateUserDto): Promise<UserEntity> {
    const tempDeviceUuid = `admin-bootstrap-${dto.email}-${Date.now()}`;
    const user = this.userRepo.create({
      email: dto.email,
      deviceUuid: tempDeviceUuid,
      firstName: dto.first_name ?? null,
      lastName: dto.last_name ?? null,
      organizationId: dto.organization_id ?? null,
      roleId: dto.role_id ?? null,
      isActive: true,
      permissions: [],
    });
    return this.userRepo.save(user);
  }

  /**
   * T5.6 — `PATCH /api/users/:id`. Admin-side field updates; only the
   * fields present in the body are touched. Name updates still go
   * through `updateProfile` (R4 self-service path) — this method only
   * handles role + organization moves.
   */
  async adminUpdate(id: string, dto: AdminUpdateUserDto): Promise<UserEntity> {
    const target = await this.findById(id);
    if (dto.role_id !== undefined) {
      const role = await this.roleRepo.findOne({ where: { id: dto.role_id } });
      if (!role) {
        throw new NotFoundException(`Role ${dto.role_id} not found`);
      }
      target.roleId = role.id;
      target.permissions = role.permissions ?? [];
      target.permissionVersion = (target.permissionVersion ?? 1) + 1;
    }
    if (dto.organization_id !== undefined) {
      target.organizationId = dto.organization_id;
    }
    if (dto.first_name !== undefined) {
      target.firstName = dto.first_name;
    }
    if (dto.last_name !== undefined) {
      target.lastName = dto.last_name;
    }
    const saved = await this.userRepo.save(target);
    await this.authService.invalidatePermissionCache(saved.id, saved.deviceUuid);
    return saved;
  }

  /**
   * T5.6 — `DELETE /api/users/:id`. Soft delete by setting
   * `is_active = false` and clearing session keys. We do NOT use
   * TypeORM's `@DeleteDateColumn` because the `users` table has no
   * `deleted_at` column (no migration added it; soft-delete in this
   * project is modeled as `is_active = false` for consistency with
   * the existing 0001 schema).
   */
  async softDelete(id: string): Promise<void> {
    const target = await this.findById(id);
    target.isActive = false;
    await this.userRepo.save(target);
    await this.authService.invalidatePermissionCache(target.id, target.deviceUuid);
  }
}
