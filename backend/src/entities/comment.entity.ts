import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * comments table (T2.2 — 0005_comments.sql). Content is sanitized
 * (script tags stripped/escaped) in CommentsService.sanitizeContent BEFORE
 * this entity is ever persisted — never store raw user input (spec R3).
 */
@Entity('comments')
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** T7.4 (0033) — self-referencial, profundidad máxima 2 (design D6). */
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  /** T7.4.A8 — soft delete, requerido por la cascada recursiva del hilo. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
