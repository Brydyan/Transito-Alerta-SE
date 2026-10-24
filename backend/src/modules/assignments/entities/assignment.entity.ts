import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** assignments table (T2.4 — 0007_assignments.sql). */
@Entity('assignments')
export class AssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId!: string;

  @Column({ name: 'operator_id', type: 'uuid' })
  operatorId!: string;

  @Column({ type: 'varchar', default: 'primary' })
  role!: string;

  /** T6.2 — soft delete timestamp (migration 0026). NULL = active. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', update: false })
  updatedAt!: Date;

  /**
   * F7 emergency-dispatch (migration 0069, design D3) — cap-override audit.
   * Persisted on the assignment row because the project has NO separate
   * audit table (verified). `cap_override_by` FK to users(id) so revoking
   * the author cascades the field to NULL. The pair (reason + by) is the
   * only evidence that the assignment was authorized above the per-org
   * cap, and the operator-assigned listener reads `cap_override_reason`
   * to include it in the Telegram message (D11).
   */
  @Column({ name: 'cap_override_reason', type: 'text', nullable: true, default: null })
  capOverrideReason!: string | null;

  @Column({ name: 'cap_override_by', type: 'uuid', nullable: true, default: null })
  capOverrideBy!: string | null;
}
