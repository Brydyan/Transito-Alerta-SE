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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
