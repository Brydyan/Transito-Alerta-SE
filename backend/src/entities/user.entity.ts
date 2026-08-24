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

  /**
   * T3.6 (0017) — relaxed to nullable. `users_device_uuid_key` is KEPT
   * (design D7): Postgres UNIQUE tolerates unlimited NULLs, so
   * password-only users (created via invitation redemption) coexist with
   * device-only users while two real devices still cannot share a uuid.
   */
  @Column({ name: 'device_uuid', type: 'varchar', unique: true, nullable: true })
  deviceUuid!: string | null;

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

  /**
   * T3.6 (0017) — bcrypt cost-12 hash, `char(60)`. `NULL` for device-only
   * accounts; set once at invitation redemption / password-reset confirm /
   * change-password, never read or logged in plaintext (design D9, error
   * map).
   */
  @Column({ name: 'password_hash', type: 'char', length: 60, nullable: true })
  passwordHash!: string | null;

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

  /** T6.5 — timestamp when email was OTP-verified (migration 0028). */
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true, default: null })
  emailVerifiedAt!: Date | null;

  /** T6.5 — SHA-256 hex of pending OTP (migration 0028). Plain 6-digit code is emailed; hash stored in DB. */
  @Column({ name: 'verification_otp', type: 'varchar', length: 64, nullable: true, default: null })
  verificationOtp!: string | null;

  /** T6.5 — expiry for the pending OTP (migration 0028). TTL = 15 minutes. */
  @Column({ name: 'verification_otp_expires_at', type: 'timestamptz', nullable: true, default: null })
  verificationOtpExpiresAt!: Date | null;

  /** T6.5 — timestamp when user accepted the terms of service (migration 0028). */
  @Column({ name: 'terms_accepted_at', type: 'timestamptz', nullable: true, default: null })
  termsAcceptedAt!: Date | null;

  /** T6.5 — version string of the terms accepted (migration 0028). */
  @Column({ name: 'terms_version', type: 'varchar', length: 20, nullable: true, default: null })
  termsVersion!: string | null;

  /** T6.8 — GDPR soft-delete timestamp (migration 0028). NULL = active. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
