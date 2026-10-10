import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { UserEntity } from '../users/entities/user.entity';

/**
 * Raw row shape of the `users` + `roles` access-context join.
 * `role_deleted_at` is non-null when the assigned role is soft-deleted.
 */
export interface AuthContextRow {
  permissions: string[] | null;
  organization_id: string | null;
  device_uuid: string;
  role_name: string | null;
  /** T7.2.C4 (R7.5) — non-null when the assigned role is soft-deleted. */
  role_deleted_at?: Date | null;
}

/**
 * AuthUserRepository (sc-411) — the single point of access to `users` (and,
 * through the access-context join, `roles`) for AuthModule.
 *
 * Extracted from `AuthService` so the service stops mixing persistence with
 * identity/session/permission logic. Mirrors the module's existing
 * `PasswordResetRepository`: raw `@InjectDataSource` SQL where a join or a
 * conditional update is needed, TypeORM `Repository<UserEntity>` for plain
 * CRUD.
 *
 * It lives in `auth/` (not `UsersModule`) on purpose: the `Users -> Auth`
 * dependency already exists in the other direction, so importing
 * `UsersModule` here would create a hard cycle (see `AuthModule`'s doc
 * comment).
 */
@Injectable()
export class AuthUserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Device-identity lookup (the device-UUID login path). */
  findByDeviceUuid(deviceUuid: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { deviceUuid } });
  }

  /** Creates and persists a fresh device identity row. */
  async createDeviceIdentity(deviceUuid: string): Promise<UserEntity> {
    const user = this.userRepo.create({ deviceUuid, permissions: [], isActive: true });
    return this.userRepo.save(user);
  }

  /** Email-identity lookup (the email/password login path). */
  findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.userRepo.update(userId, { passwordHash });
  }

  /**
   * The `users` + `roles` access-context read, lifted from
   * `AuthService.getAuthContextByUserId`. Returns the single matching row or
   * `null`; the caller owns caching and anonymous/soft-deleted-role
   * resolution.
   */
  async findAuthContextRow(userId: string): Promise<AuthContextRow | null> {
    const rows: AuthContextRow[] = await this.dataSource.query(
      // T6.8.B3: exclude soft-deleted and inactive users so a deleted user
      // cannot use a cached/unexpired JWT to authenticate.
      // T7.2.C4 (R7.5): also surface the assigned role's own `deleted_at` —
      // `users.permissions` is a denormalized snapshot (RolesService.assignRole)
      // that does NOT get cleared when the role itself is later soft-deleted,
      // so `role_deleted_at` must be checked here to zero it out live.
      `SELECT u.permissions, u.organization_id, u.device_uuid, r.name AS role_name,
              r.deleted_at AS role_deleted_at
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.deleted_at IS NULL AND u.is_active = TRUE`,
      [userId],
    );
    return rows[0] ?? null;
  }
}
