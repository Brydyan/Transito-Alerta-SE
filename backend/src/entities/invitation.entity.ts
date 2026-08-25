import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * invitations table (T3.6 — 0018_invitations.sql). `accepted_at` is the
 * single source of "used" state — no separate boolean column (spec
 * "Invitation Record"). `token_hash` is the ONLY representation of the
 * token ever persisted; the plaintext token is emailed exactly once.
 *
 * Not used by `InvitationsRepository` (raw SQL via `@InjectDataSource`,
 * house convention, precedent `SessionsRepository`) — declared for
 * TypeORM's entity registry / migrations tooling consistency only.
 */
@Entity('invitations')
export class InvitationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash!: string;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'invited_by_user_id', type: 'uuid', nullable: true })
  invitedByUserId!: string | null;

  /** T7.2 (0031) — soft delete (schema parity; revocation still uses hard `deleteIfPending`). */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
