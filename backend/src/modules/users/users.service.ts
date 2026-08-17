import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';

import { UserEntity } from '../../entities/user.entity';
import { UserSessionEntity } from '../../entities/user-session.entity';
import { RoleEntity } from '../../entities/role.entity';
import { AuthContext, SubjectScope } from '../../common/authz/subject-scope';
import { assertCanManage } from '../../common/authz/assert-can-manage';
import { AuthService } from '../auth/auth.service';
import { AvatarStorageService, UploadedFile } from './avatar-storage.service';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
}

/**
 * UsersService (R4) — profile, avatar (multipart -> S3 -> signed URL),
 * paginated listing, lightweight device-tracking on new-device login.
 * Design DAG: `Users -> Roles, Organizations (optional)`.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserSessionEntity)
    private readonly sessionRepo: Repository<UserSessionEntity>,
    private readonly avatarStorage: AvatarStorageService,
    @InjectRepository(RoleEntity) private readonly roleRepo: Repository<RoleEntity>,
    private readonly authService: AuthService,
  ) {}

  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
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

  /**
   * Records a new-device login (spec R4). No-op if this user/device pair is
   * already tracked — avoids a row-per-request explosion. Full session
   * revocation/audit semantics land in T3.9 (Sessions module, R15).
   */
  /** Passive listener (design D7) — AuthService emits this on every login. */
  @OnEvent('auth.login')
  async handleAuthLogin(payload: { userId: string; deviceUuid: string }): Promise<void> {
    await this.recordSession(payload.userId, payload.deviceUuid);
  }

  async recordSession(userId: string, deviceUuid: string): Promise<void> {
    const existing = await this.sessionRepo.findOne({ where: { userId, deviceUuid } });
    if (existing) {
      return;
    }
    const session = this.sessionRepo.create({ userId, deviceUuid });
    await this.sessionRepo.save(session);
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
}
