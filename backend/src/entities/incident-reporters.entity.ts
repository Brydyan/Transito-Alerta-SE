import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';

import { UserEntity } from './user.entity';
import { IncidentEntity } from './incident.entity';

/**
 * AUD (sc-327) D1/D2 — autor real de una publicación
 * anónima. Una fila por incidencia. La PK sobre `incident_id`
 * refleja la cardinalidad 1:1 (una incidencia tiene un único
 * autor real, no se reescribe).
 *
 * `eager: false` deliberado (B.2). Que aparezca en una
 * respuesta tiene que costar escribirlo — el patrón "regla
 * a medias" del proyecto es exactamente que una ruta nueva
 * olvide filtrar. La única ruta que la carga es la de
 * revelación (REVEAL incidents), que vive en su propio
 * método del servicio.
 *
 * El acceso a esta tabla está protegido por el permiso
 * `REVEAL incidents` (D5, C.1). Sólo `master` lo tiene.
 * Endurecimiento posterior: REVOKE a nivel de Postgres
 * y rol dedicado al servicio de revelación (D2).
 */
@Entity('incident_reporters')
@Index('idx_incident_reporters_user', ['userId', 'createdAt'])
export class IncidentReporterEntity {
  /** 1:1 con `incidents.id`. La PK aquí es FK a la vez. */
  @PrimaryColumn({ name: 'incident_id', type: 'uuid' })
  incidentId!: string;

  @OneToOne(() => IncidentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident!: IncidentEntity;

  /** Autor real. NO DEBE aparecer en respuestas del módulo
   * de incidencias sin pasar por la acción REVEAL. */
  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
