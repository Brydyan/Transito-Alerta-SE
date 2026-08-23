import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * status_history table (T3.4 — 0014_status_history.sql).
 *
 * Append-only audit trail of `incidents.status` transitions, written
 * exclusively by `IncidentStatusHistoryListener` (never by the read path —
 * D7). No `@UpdateDateColumn`: the table has no `updated_at` column by
 * design (append-only), and no relations are declared here (D8 — this
 * module reads `IncidentEntity` directly, not through a TypeORM relation).
 */
@Entity('status_history')
export class StatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId!: string;

  @Column({ name: 'changed_by_user_id', type: 'uuid', nullable: true })
  changedByUserId!: string | null;

  @Column({ name: 'previous_status', type: 'varchar' })
  previousStatus!: string;

  @Column({ name: 'new_status', type: 'varchar' })
  newStatus!: string;

  @Column({ name: 'event_id', type: 'varchar' })
  eventId!: string;

  /**
   * T5.6 — populated by the reject path with the admin's reason. Null for
   * every other status transition (approval, manual operator change, etc.).
   * Read by the audit trail surfaced to operators who later look up the
   * incident history.
   */
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
