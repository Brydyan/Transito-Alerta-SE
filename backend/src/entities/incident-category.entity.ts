import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
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

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
