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
}
