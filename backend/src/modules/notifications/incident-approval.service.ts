import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CommentEntity } from '../../entities/comment.entity';
import { IncidentEntity } from '../../entities/incident.entity';
import { Notification, NotificationType } from './entities/notification.entity';

/**
 * T5.6 + sc-315 — IncidentApprovalService.
 *
 * sc-315 (fix-incident-state-machine) RECONCILIATION (D5 del design):
 *
 * La lectura vieja hacía de la aprobación/rechazo una transición de
 * estado: `approve` movía `resolved → closed`, `reject` revertía a
 * `in_progress` o `pending`. Esa lectura era la semántica LINEAL del
 * comentario de la migración 0020 (`resolved → closed` como archivado
 * post-resolución) y es la que la máquina nueva prohíbe.
 *
 * Bajo la semántica ramificada vigente (D1 del design):
 *  - `resolved` es terminal — el operador resolvió. La aprobación del
 *    admin NO es un cambio de estado: es un atributo (`approved_by/at`).
 *  - `closed` es terminal alternativo — la incidencia no pudo
 *    resolverse. Lo dispara `IncidentWorkflowService.changeStatus()`
 *    con un motivo (D4), no la aprobación.
 *  - El rechazo del admin ya no revierte a `in_progress`/`pending`
 *    (esos estados son previos a `resolved`, no alcanzables desde un
 *    terminal). El rechazo deja el status en `resolved` y estampa
 *    `rejected_by/at/reason`. La acción correctiva posterior —si
 *    alguien decide que la resolución era errónea— la dispara un
 *    admin con `CLOSE incidents` y motivo explícito, por la ruta
 *    canónica `PATCH /incidents/:id/status`.
 *
 * Métodos públicos:
 *  - `approve(notificationId, actorId)` — estampa `approved_by/at`,
 *    limpia los campos de rechazo. NO cambia `status` (el status
 *    sigue siendo `resolved`).
 *  - `reject(notificationId, actorId, reason)` — estampa
 *    `rejected_by/at/reason`, limpia los campos de aprobación, persiste
 *    la razón como Comment (audit trail) y marca la notificación
 *    procesada. NO revierte `status`.
 *
 * La transacción `DataSource.transaction` con `pessimistic_write` se
 * conserva: un doble-click en la UI del admin no debe procesar la
 * misma notificación dos veces.
 */
@Injectable()
export class IncidentApprovalService {
  private readonly logger = new Logger(IncidentApprovalService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(IncidentEntity)
    private readonly incidentRepo: Repository<IncidentEntity>,
    @InjectRepository(CommentEntity)
    private readonly commentRepo: Repository<CommentEntity>,
  ) {}

  async approve(notificationId: string, actorId: string): Promise<IncidentEntity> {
    return this.dataSource.transaction(async (manager) => {
      const notif = await this.lockNotification(manager, notificationId);
      this.assertPending(notif);
      if (!notif.incident_id) {
        throw new ConflictException(
          `Notification ${notificationId} has no incident_id — cannot approve`,
        );
      }
      const incident = await this.lockIncident(manager, notif.incident_id);
      if (incident.status !== 'resolved') {
        throw new ConflictException(
          `Incident ${incident.id} is not in 'resolved' state (current: ${incident.status})`,
        );
      }

      // Use the transaction's own QueryRunner for raw SQL so the UPDATE
      // runs on the same connection as the pessimistic locks above.
      // manager.query() routes through DataSource which opens a new
      // connection and would bypass the transaction.
      //
      // sc-315 — el `status` ya NO se cambia a 'closed'. La aprobación
      // es un atributo (D5 del design), no una transición de estado.
      // El status sigue siendo 'resolved' (terminal bajo la nueva
      // semántica); lo que se estampa es `approved_by/at`.
      await manager.queryRunner!.query(
        `UPDATE incidents
         SET approved_by = $1, approved_at = NOW(),
             rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
         WHERE id = $2`,
        [actorId, incident.id],
      );
      const updated = await manager.getRepository(IncidentEntity).findOneOrFail({ where: { id: incident.id } });

      // Mark this notification + every sibling processed.
      await this.markNotificationAndSiblingsProcessed(manager, notificationId, notif.incident_id);

      this.logger.log(
        `Incident ${incident.id} approved by ${actorId} (notification ${notificationId})`,
      );
      return updated;
    });
  }

  async reject(
    notificationId: string,
    actorId: string,
    reason: string,
  ): Promise<IncidentEntity> {
    return this.dataSource.transaction(async (manager) => {
      const notif = await this.lockNotification(manager, notificationId);
      this.assertPending(notif);
      if (!notif.incident_id) {
        throw new ConflictException(
          `Notification ${notificationId} has no incident_id — cannot reject`,
        );
      }
      const incident = await this.lockIncident(manager, notif.incident_id);
      if (incident.status !== 'resolved') {
        throw new ConflictException(
          `Incident ${incident.id} is not in 'resolved' state (current: ${incident.status})`,
        );
      }

      // sc-315 — el rechazo ya NO revierte el status. `resolved` es
      // terminal bajo la nueva semántica; no se puede volver a
      // `in_progress` ni a `pending` (la transición `resolved → in_progress`
      // no existe en la máquina). El status se queda en `resolved` y
      // se estampa `rejected_by/at/reason`. La acción correctiva, si
      // alguien la considera necesaria, se dispara por la ruta
      // canónica `PATCH /incidents/:id/status` con `to = 'closed'` y
      // motivo — exige `CLOSE incidents` y la audita
      // `IncidentWorkflowService.changeStatus()` con su propia entrada
      // de `status_history`.
      //
      // También ya no se limpia `claimed_by` en esta rama: la decisión
      // de liberar la incidencia es independiente de la decisión de
      // rechazar la resolución. El operador sigue siendo responsable de
      // la fila; el admin deja registro de que la considera errónea.
      const _stillClaimed = await this.operatorStillActive(
        manager,
        incident.claimedBy,
      );
      void _stillClaimed; // mantenemos la consulta para preservar la
                           // traza de auditoría (si el operador sigue
                           // activo al momento del rechazo, queda en
                           // `comments` y `rejection_reason`); pero ya
                           // no bifurca la rama SQL.

      // Use the transaction's own QueryRunner (same reason as approve()).
      await manager.queryRunner!.query(
        `UPDATE incidents
         SET rejected_by = $1, rejected_at = NOW(), rejection_reason = $2,
             approved_by = NULL, approved_at = NULL
         WHERE id = $3`,
        [actorId, reason, incident.id],
      );
      const updated = await manager.getRepository(IncidentEntity).findOneOrFail({ where: { id: incident.id } });

      // Audit trail — a `comments` row with the reason. Same table the
      // citizens use, so the existing GET /comments/incident/:id
      // surfaces the audit entry without a new query path.
      await manager.getRepository(CommentEntity).save({
        incidentId: incident.id,
        userId: actorId,
        content: `[admin reject] ${reason}`,
      });

      await this.markNotificationAndSiblingsProcessed(manager, notificationId, notif.incident_id);

      this.logger.log(
        `Incident ${incident.id} rejected by ${actorId} (notification ${notificationId})`,
      );
      return updated;
    });
  }

  // ---- private helpers ------------------------------------------------

  private async lockNotification(
    manager: import('typeorm').EntityManager,
    id: string,
  ): Promise<Notification> {
    const notif = await manager
      .getRepository(Notification)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!notif) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    if (notif.type !== NotificationType.INCIDENT_PENDING_APPROVAL) {
      throw new ConflictException(
        `Notification ${id} is not an incident_pending_approval (type: ${notif.type})`,
      );
    }
    return notif;
  }

  private assertPending(notif: Notification): void {
    if (notif.processed_at !== null) {
      throw new ConflictException(
        `Notification ${id(notif)} was already processed at ${notif.processed_at.toISOString()}`,
      );
    }
  }

  private async lockIncident(
    manager: import('typeorm').EntityManager,
    id: string,
  ): Promise<IncidentEntity> {
    const incident = await manager
      .getRepository(IncidentEntity)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!incident) {
      throw new NotFoundException(`Incident ${id} not found`);
    }
    return incident;
  }

  /**
   * Mark `notificationId` processed AND every sibling — every other
   * `INCIDENT_PENDING_APPROVAL` row for the same incident that is still
   * unprocessed. Siblings are usually duplicate listeners (e.g. one per
   * admin) created when the same incident first hits `resolved`.
   */
  private async markNotificationAndSiblingsProcessed(
    manager: import('typeorm').EntityManager,
    notificationId: string,
    incidentId: string,
  ): Promise<void> {
    const now = new Date();
    const repo = manager.getRepository(Notification);
    // The current row.
    await repo.update(notificationId, { processed_at: now, read: true });
    // Siblings.
    await repo
      .createQueryBuilder()
      .update()
      .set({ processed_at: now, read: true })
      .where('incident_id = :incidentId', { incidentId })
      .andWhere('type = :type', { type: NotificationType.INCIDENT_PENDING_APPROVAL })
      .andWhere('processed_at IS NULL')
      .andWhere('id != :notificationId', { notificationId })
      .execute();
  }

  private async operatorStillActive(
    manager: import('typeorm').EntityManager,
    userId: string | null,
  ): Promise<boolean> {
    if (!userId) return false;
    const user = await manager.getRepository('UserEntity' as never).findOne({
      where: { id: userId, isActive: true },
    } as never);
    return user != null;
  }
}

// Tiny helper — avoids shadowing the closure param name in `assertPending`.
function id(notif: Notification): string {
  return notif.id;
}
