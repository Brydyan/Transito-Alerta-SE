import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * menu_option_roles table (F5 — dynamic menus).
 *
 * Composite PK (menu_option_id, role_id). Physical delete (D6) — this
 * is pure configuration with no historical value; preserving soft-deleted
 * rows would complicate the composite PK without benefit.
 */
@Entity('menu_option_roles')
export class MenuOptionRoleEntity {
  @PrimaryColumn({ name: 'menu_option_id', type: 'uuid' })
  menuOptionId!: string;

  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @Column({ name: 'can_read', type: 'boolean', default: false })
  canRead!: boolean;

  @Column({ name: 'can_write', type: 'boolean', default: false })
  canWrite!: boolean;
}
