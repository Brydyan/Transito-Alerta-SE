import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from '../../entities/user.entity';
import { UserSessionEntity } from '../../entities/user-session.entity';
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
  ) {}

  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
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

  async list(page = 1, limit = DEFAULT_PAGE_SIZE): Promise<{ items: UserEntity[]; total: number }> {
    const take = Math.min(limit, MAX_PAGE_SIZE);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * take;

    const [items, total] = await this.userRepo.findAndCount({ take, skip });
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
}
