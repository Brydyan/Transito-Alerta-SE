import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * user_sessions table (T2.3 — 0006_users.sql).
 *
 * Lightweight device-tracking row, created on new-device login (spec R4).
 * This is intentionally minimal — full revocation/audit semantics land in
 * the Sessions module (R15, T3.9); this table only satisfies "system MUST
 * record the new device as a tracked session source".
 */
@Entity('user_sessions')
export class UserSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'device_uuid', type: 'varchar' })
  deviceUuid!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
