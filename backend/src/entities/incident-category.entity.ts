import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { IncidentPriority } from './incident.entity';

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

  /**
   * sc-334-adjacent (T7.4) — optional free-text description. NOT exposed
   * via the public `/api/menus/my` or `/api/incidents` endpoints (the
   * menu payload and incident projection stay slim). Surfaced via the
   * admin form (`/app/categorias/new`) and the dedicated
   * `/api/incident-categories/{id}` GET response.
   */
  @Column({ type: 'text', nullable: true, default: null })
  description!: string | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  /**
   * 2026-09-22-sc-subcategory-priority-assignment (0065). Default
   * priority for incidents filed under this sub-category. NULL on root
   * categories (service rejects sub-categories with NULL — see
   * `IncidentCategoriesService` validation).
   *
   * Stored as `varchar(16)` to match the `IncidentPriority` union
   * ('low' | 'medium' | 'high' | 'critical') without a PG enum, keeping
   * the migration reversible and column drops painless.
   */
  @Column({ type: 'varchar', length: 16, nullable: true, default: null })
  priority!: IncidentPriority | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', update: false })
  updatedAt!: Date;

  /** T7.2 (0031) — soft delete. Excluded from list/tree reads. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt!: Date | null;
}
