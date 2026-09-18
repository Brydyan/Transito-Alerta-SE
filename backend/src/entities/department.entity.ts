import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { OrganizationEntity } from './organization.entity';

/**
 * `departments` table — optional organizational subdivision (design D1).
 *
 * Pattern follows the other soft-deletable tables (0015_organizations_scoping,
 * 0025_incidents_soft_delete, 0031_soft_delete_completeness):
 *   - `deleted_at` is the SOFT-delete tombstone, read by `WHERE deleted_at IS NULL`
 *     in every query unless explicitly bypassing for admin tools.
 *   - `users.department_id` and `incidents.department_id` are nullable with
 *     `ON DELETE SET NULL` so the relational graph survives dept deletion
 *     without losing user/incident rows.
 *
 * `organization_id` is IMMUTABLE on PATCH (design D4): moving a dept between
 * orgs would require a separate, audited "transfer" flow — out of scope here.
 *
 * UNIQUE(organization_id, name) enforces per-org naming uniqueness; the
 * migration `0056_departments.sql` mirrors it on the database side.
 */
@Entity('departments')
@Unique('uq_departments_org_name', ['organizationId', 'name'])
export class DepartmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true, default: null })
  description!: string | null;

  /**
   * FK to `organizations`. NOT NULL — every department belongs to exactly
   * one organization. CASCADE on org delete removes the dept too; the
   * nullable FK on `users.department_id` / `incidents.department_id`
   * handles the user/incident orphans before the cascade fires.
   */
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: OrganizationEntity;

  /** T7.2 (0031) — soft delete. All list/find reads must filter this. */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
