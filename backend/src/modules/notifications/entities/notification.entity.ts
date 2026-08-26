import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../../entities/user.entity';
import { IncidentEntity } from '../../../entities/incident.entity';

export enum NotificationType {
  INCIDENT_CREATED = 'incident.created',
  INCIDENT_ASSIGNED = 'incident.assigned',
  INCIDENT_STATUS_CHANGED = 'incident.status_changed',
  COMMENT_ADDED = 'comment.added',
  // T5.6 — emitted when an incident hits 'resolved' and waits for admin
  // moderation (approve/reject). The CHECK constraint on
  // notifications.type is extended in lockstep via migration 0022.
  INCIDENT_PENDING_APPROVAL = 'incident_pending_approval',
}

@Entity('notifications')
@Index(['user_id', 'created_at'])
@Index(['user_id', 'read'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  user_id: string;

  @Column('uuid', { nullable: true })
  incident_id: string | null;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column('text')
  message: string;

  @Column('jsonb', { default: '{}' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;

  @Column('boolean', { default: false })
  read: boolean;

  @CreateDateColumn()
  created_at: Date;

  @Column('timestamp', { nullable: true })
  processed_at: Date | null;

  /** T7.2 (0031) — soft delete. Excluded from list/unread-count reads. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deleted_at: Date | null;

  @Column({ name: 'updated_at', type: 'timestamptz', update: false })
  updated_at: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => IncidentEntity, { onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'incident_id' })
  incident: IncidentEntity;
}
