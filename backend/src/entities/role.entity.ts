import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Roles table (T1.2 — 0001_initial_schema.sql; `permissions` added in T3.1
 * — 0009_roles_permissions.sql).
 *
 * A role is a named composition of "ACTION resource" permission strings
 * (same flat format PermissionGuard/AuthService already compare — design
 * D3, no hardcoded resource map). `RolesService.assignRole` denormalizes
 * this array onto `users.permissions` and bumps `users.permission_version`
 * (D2) so the cached `perm:*` Redis blob is invalidated without reissuing
 * tokens.
 */
@Entity('roles')
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  permissions!: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
