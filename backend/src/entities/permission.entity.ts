import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PermissionAction } from '../common/decorators/require-permission.decorator';

/**
 * Permissions catalog table (T3.1 — 0009_roles_permissions.sql, R7).
 *
 * Informational only — a reference list of valid resource+action pairs for
 * building/validating role definitions (and later the R16 Menus module).
 * PermissionGuard's authorization decision NEVER queries this table; it
 * still compares flat "ACTION resource" strings on the caller's resolved
 * permission set (design D3, no hardcoded resource map).
 */
@Entity('permissions')
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  resource!: string;

  @Column({ type: 'varchar' })
  action!: PermissionAction;

  /** T7.2 (0031) — soft delete. Excluded from the catalog listing. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
