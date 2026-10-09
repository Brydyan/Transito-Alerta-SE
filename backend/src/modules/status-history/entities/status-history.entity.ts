import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * status_history table (T3.4 — 0014_status_history.sql).
 *
 * Append-only audit trail of `incidents.status` transitions, written
 * exclusively por `IncidentWorkflowService.changeStatus()`, en la MISMA
 * transacción que el `UPDATE incidents` (sc-315: «un cambio sin registro es
 * peor que no haber cambiado»). Nunca por el camino de lectura (D7).
 *
 * Hasta sc-315 lo escribía `IncidentStatusHistoryListener`, consumiendo
 * `incident.status_changed` del stream. Ese listener se retiró: convivía con
 * la escritura transaccional y producía dos filas por transición, y además
 * dejaba el historial expuesto a perderse en silencio si el consumidor moría. No `@UpdateDateColumn`: the table has no `updated_at` column by
 * design (append-only), and no relations are declared here (D8 — this
 * module reads `IncidentEntity` directly, not through a TypeORM relation).
 */
@Entity('status_history')
export class StatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId!: string;

  @Column({ name: 'changed_by_user_id', type: 'uuid', nullable: true })
  changedByUserId!: string | null;

  @Column({ name: 'previous_status', type: 'varchar' })
  previousStatus!: string;

  @Column({ name: 'new_status', type: 'varchar' })
  newStatus!: string;

  @Column({ name: 'event_id', type: 'varchar' })
  eventId!: string;

  /**
   * T5.6 — populated by the reject path with the admin's reason. Null for
   * every other status transition (approval, manual operator change, etc.).
   * Read by the audit trail surfaced to operators who later look up the
   * incident history.
   */
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
