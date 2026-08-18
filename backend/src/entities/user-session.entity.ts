import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * user_sessions table (T2.3 — 0006_users.sql; revocation columns added by
 * T3.9 — 0016_sessions_revocation.sql).
 *
 * `id` IS the `sid` JWT claim (no separate column, spec "Session Record").
 * The eight columns below are all nullable (design D12) — pre-0016 rows
 * keep `refresh_token_hash IS NULL` and `expires_at` backfilled to
 * `created_at`, so they fail `isValid()` on two independent clauses
 * without a synthetic/placeholder hash ever being written.
 */
@Entity('user_sessions')
export class UserSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'device_uuid', type: 'varchar' })
  deviceUuid!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'refresh_token_hash', type: 'char', length: 64, nullable: true })
  refreshTokenHash!: string | null;

  @Column({ name: 'previous_refresh_token_hash', type: 'char', length: 64, nullable: true })
  previousRefreshTokenHash!: string | null;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt!: Date | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  /**
   * Mirrors `ACTIVE_SESSION_SQL` exactly (design §4) — MUST be the same
   * predicate as `sessions/session-validity.ts`, never re-derived
   * independently, or the two would silently drift.
   */
  isValid(now: Date): boolean {
    return (
      this.revokedAt === null &&
      this.expiresAt !== null &&
      this.expiresAt.getTime() > now.getTime() &&
      this.refreshTokenHash !== null
    );
  }
}
