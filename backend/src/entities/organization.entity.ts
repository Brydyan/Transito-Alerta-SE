import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Organizations table (T1.2 — 0001_initial_schema.sql). */
@Entity('organizations')
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ name: 'zone_id', type: 'uuid', nullable: true })
  zoneId!: string | null;

  /** T7.5 (0034) — institutional hierarchy, orthogonal to `zoneId` (design D8). */
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  /** T7.5 (0034) — routing category; NULL = transversal (design D7). */
  @Column({ name: 'incident_category_id', type: 'uuid', nullable: true })
  incidentCategoryId!: string | null;

  /**
   * T5.1 — max simultaneous in-progress claims an operator in this org can
   * hold. Default 5 (applied at row-create time by migration 0019).
   */
  @Column({ name: 'max_active_claims', type: 'int', default: 5 })
  maxActiveClaims!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
