import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CommentEntity } from '../../entities/comment.entity';
import { IncidentEntity, IncidentStatus } from '../../entities/incident.entity';
import { Notification, NotificationType } from './entities/notification.entity';

/**
 * T5.6 — IncidentApprovalService.
 *
 * Wraps the admin approve/reject flow for an incident that reached
 * `resolved` and now needs moderation. The implementation follows the
 * project's house pattern for state transitions that involve multiple
 * tables: a single `DataSource.transaction` with `pessimistic_write`
 * locks on the notification and the incident, so a double-click on
 * the admin UI cannot double-process the same row.
 *
 * Two public methods:
 *  - `approve(notificationId, actorId)` — incident moves to `closed`
 *    (terminal), `approved_by/at` is stamped, the notification + every
 *    sibling (same `incident_id` + type + unprocessed) is marked
 *    `processed_at = now(), read = true`.
 *  - `reject(notificationId, actorId, reason)` — incident reverts to
 *    `in_progress` if an operator is still holding the claim, or back
 *    to `pending` otherwise. `rejected_by/at/reason` is stamped, the
 *    rejection reason is persisted as a `Comment` (audit trail) and
 *    the notification + siblings are marked processed.
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
      await manager.queryRunner!.query(
        `UPDATE incidents
         SET status = $1, approved_by = $2, approved_at = NOW(),
             rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
         WHERE id = $3`,
        ['closed', actorId, incident.id],
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

      // Revert to in_progress (operator still active) or pending (no
      // operator). If a stale claimer is gone, the claim is cleared.
      const stillClaimed = await this.operatorStillActive(
        manager,
        incident.claimedBy,
      );
      const nextStatus: IncidentStatus = stillClaimed ? 'in_progress' : 'pending';

      // Use the transaction's own QueryRunner (same reason as approve()).
      if (stillClaimed) {
        await manager.queryRunner!.query(
          `UPDATE incidents
           SET status = $1, rejected_by = $2, rejected_at = NOW(), rejection_reason = $3,
               approved_by = NULL, approved_at = NULL
           WHERE id = $4`,
          [nextStatus, actorId, reason, incident.id],
        );
      } else {
        await manager.queryRunner!.query(
          `UPDATE incidents
           SET status = $1, rejected_by = $2, rejected_at = NOW(), rejection_reason = $3,
               approved_by = NULL, approved_at = NULL, claimed_by = NULL
           WHERE id = $4`,
          [nextStatus, actorId, reason, incident.id],
        );
      }
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
