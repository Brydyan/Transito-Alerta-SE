import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Users table (T1.2 — 0001_initial_schema.sql).
 *
 * Per design D1, one `users` row per identity: anonymous device
 * registration and authenticated accounts share this table. Permission
 * strings (e.g. "READ incidents") are cached in Redis, derived from this
 * row's role(s) — see AuthService.getPermissions.
 */
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'device_uuid', type: 'varchar', unique: true })
  deviceUuid!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  permissions!: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'first_name', type: 'varchar', nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', nullable: true })
  lastName!: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', nullable: true })
  avatarUrl!: string | null;

  /**
   * Mail module (T3.5 — 0010_user_email.sql, design D11). Nullable: every
   * anonymous identity and every pre-existing authenticated user has no
   * address until one is added. `IncidentMailListener` skips (debug log,
   * no retry) any recipient resolved with `email === null`.
   */
  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', default: 'reporter' })
  role!: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  /**
   * FK to `roles` (T3.1 — 0009_roles_permissions.sql). Replaces the inline
   * `role` varchar stub as the authoritative source RolesService.assignRole
   * writes to; `role` (varchar) is left in place for backward compat with
   * existing reads and is not removed by this migration.
   */
  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId!: string | null;

  /**
   * Permission version (design D2's `pv`). Bumped by
   * RolesService.assignRole on every role reassignment so a stale cached
   * `perm:*` Redis blob can be told apart from a fresh one without
   * reissuing any JWT. Not currently compared against the JWT `pv` claim —
   * this task invalidates the Redis cache directly (see
   * AuthService.invalidatePermissionCache); comparing against the token
   * claim is a possible follow-up, not required by R6/R7.
   */
  @Column({ name: 'permission_version', type: 'integer', default: 1 })
  permissionVersion!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
