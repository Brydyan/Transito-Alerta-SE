import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * menu_options table (F5 — dynamic menus).
 *
 * Self-referencing adjacency list for parent/child hierarchy (D3).
 * Soft delete via `deleted_at` (D6) — the rollback path per D7 is to
 * reactivate the static MENU_MAP resolver, not to restore deleted rows.
 */
@Entity('menu_options')
export class MenuOptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  route!: string;

  @Column({ type: 'varchar', nullable: true })
  icon!: string | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ name: 'display_order', type: 'int' })
  displayOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', update: false })
  updatedAt!: Date;
}
