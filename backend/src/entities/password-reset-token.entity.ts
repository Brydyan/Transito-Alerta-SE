import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * password_reset_tokens table (T3.6 — 0018_invitations.sql). Same shape as
 * `invitations` (spec "Invitation Record"): `used_at` is the single source
 * of "used" state, `token_hash` (SHA-256 hex) is the only representation of
 * the token ever persisted.
 *
 * Not used by `PasswordResetRepository` (raw SQL via `@InjectDataSource`) —
 * declared for TypeORM's entity registry consistency only.
 */
@Entity('password_reset_tokens')
export class PasswordResetTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash!: string;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /** T7.2 (0031) — soft delete (schema parity; not wired into any write path). */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
