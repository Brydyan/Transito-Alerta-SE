import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * incident_categories table (T3.7 — 0012_incident_categories.sql).
 *
 * Flat adjacency-list columns only — NO self `@ManyToOne`/`@OneToMany`
 * relation (design D2): 8/9 entities in this directory are flat, and a
 * TypeORM self-relation here would invite lazy-load N+1 and duplicate the
 * recursive CTE `IncidentCategoriesRepository` already owns for tree reads.
 */
@Entity('incident_categories')
export class IncidentCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', update: false })
  updatedAt!: Date;

  /** T7.2 (0031) — soft delete. Excluded from list/tree reads. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt!: Date | null;
}
