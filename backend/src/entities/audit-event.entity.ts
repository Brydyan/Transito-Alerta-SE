import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { UserEntity } from './user.entity';

/**
 * AUD (sc-327) — registro genérico e inmutable de una acción
 * auditable (D3 del design).
 *
 * Tabla: `audit_events`. La escritura es append-only — el
 * `AuditService` sólo expone `record(...)`, no `update` ni
 * `delete`. Un registro de auditoría editable no es un registro
 * de auditoría.
 *
 * `justification` es anulable en el esquema y obligatorio por
 * acción. La revelación (`REVEAL incidents`) la exige; la
 * excepción al tope de F7 también; una acción de sólo lectura
 * podría no necesitarla. Poner la restricción en el servicio
 * (no en la columna) deja entrar F7 sin migración adicional.
 */
@Entity('audit_events')
@Index('idx_audit_resource', ['resourceType', 'resourceId', 'createdAt'])
@Index('idx_audit_actor', ['actorId', 'createdAt'])
export class AuditEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Quien ejecutó la acción. */
  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_id' })
  actor!: UserEntity;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  /**
   * Acción ejecutada. varchar(64) en vez de enum para no
   * necesitar una migración por cada acción nueva (D3). El
   * conjunto de valores válidos se acuerda en código.
   */
  @Column({ type: 'varchar', length: 64 })
  action!: string;

  /** Tipo del recurso afectado (ej: 'incidents'). */
  @Column({ name: 'resource_type', type: 'varchar', length: 64 })
  resourceType!: string;

  /** Id del recurso. Anulable: una acción puede no tener
   * recurso concreto (ej: 'limpiar caché'). */
  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId!: string | null;

  /** D3 — nullable en el esquema, obligatorio por acción. */
  @Column({ type: 'text', nullable: true })
  justification!: string | null;

  /** Metadata libre de la acción. Default '{}' en BD. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
