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
  /**
   * 2026-10-18-admin-org-dept-scoping — admin_org's departmentId.
   * `null` para master, agent_system, operator_org, reporter,
   * anonymous, o admin_org legacy sin department (cae al fallback
   * `'org'` en `resolveSubjectScope`).
   */
  department_id: string | null;
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
  /**
   * 2026-10-20 — `permission_version` del usuario, o `null` si no existe.
   *
   * La clave del cache de permisos lo incorpora (`perm:v3:uid:{id}:pv{n}`) para
   * que bumpear el valor invalide solo, que es lo que `RolesService` y las
   * migraciones 0026/0027/0028/0037 ya intentaban hacer. Antes esa promesa no
   * se cumplía porque la clave no lo llevaba.
   *
   * Una lectura PK indexada en el camino más caliente — JwtStrategy la llama en
   * cada request Bearer. El costo se aceptó a cambio de que revocar un permiso
   * se refleje de inmediato; ver el docblock de
   * `AuthContextService.getAuthContextByUserId`.
   */
  async findPermissionVersion(userId: string): Promise<number | null> {
    const rows: Array<{ permission_version: number | null }> = await this.dataSource.query(
      'SELECT permission_version FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId],
    );
    return rows[0]?.permission_version ?? null;
  }

  async findAuthContextRow(userId: string): Promise<AuthContextRow | null> {
    const rows: AuthContextRow[] = await this.dataSource.query(
      // T6.8.B3: exclude soft-deleted and inactive users so a deleted user
      // cannot use a cached/unexpired JWT to authenticate.
      // T7.2.C4 (R7.5): also surface the assigned role's own `deleted_at` —
      // `users.permissions` is a denormalized snapshot (RolesService.assignRole)
      // that does NOT get cleared when the role itself is later soft-deleted,
      // so `role_deleted_at` must be checked here to zero it out live.
      // 2026-10-18-admin-org-dept-scoping — proyectar `department_id`
      // para que admin_org pueda resolver a scope `'department'`.
      `SELECT u.permissions, u.organization_id, u.department_id, u.device_uuid,
              r.name AS role_name, r.deleted_at AS role_deleted_at
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.deleted_at IS NULL AND u.is_active = TRUE`,
      [userId],
    );
    return rows[0] ?? null;
  }
}
