import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Users table (T1.2 — 0001_initial_schema.sql).
 *
 * Per design D1, one `users` row per identity: anonymous device
 * registration and authenticated accounts share this table. Permission
 * strings (e.g. "READ incidents") are cached in Redis, derived from this
 * row's role(s) — see AuthService.getPermissions.
 */
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'device_uuid', type: 'varchar', unique: true })
  deviceUuid!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  permissions!: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
