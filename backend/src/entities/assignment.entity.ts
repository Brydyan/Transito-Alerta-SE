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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
