import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service';
import { UsersService } from '../../users/users.service';
import { NotificationType } from '../entities/notification.entity';

@Injectable()
export class IncidentNotificationsListener {
  private readonly logger = new Logger(IncidentNotificationsListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Escuchar: incident.created
   * Notificar a admins + operadores
   */
  @OnEvent('incident.created')
  async onIncidentCreated(payload: {
    incidentId: string;
    createdById: string;
    title: string;
    location: { lat: number; lng: number };
  }) {
    try {
      const admins = await this.usersService.findByRole('admin');

      for (const admin of admins) {
        if (admin?.id) {
          await this.notificationsService.notify(
            admin,
            NotificationType.INCIDENT_CREATED,
            `Nuevo incidente: ${payload.title}`,
            payload.incidentId,
            {
              location: payload.location,
              createdBy: payload.createdById,
            },
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error notifying incident.created: ${error.message}`,
      );
    }
  }

  /**
   * Escuchar: incident.assigned
   * Notificar al operador asignado
   */
  @OnEvent('incident.assigned')
  async onIncidentAssigned(payload: {
    incidentId: string;
    assignedToId: string;
    assignedById: string;
    title: string;
  }) {
    try {
      const user = await this.usersService.findOne(payload.assignedToId);
      if (user?.id) {
        await this.notificationsService.notify(
          user,
          NotificationType.INCIDENT_ASSIGNED,
          `Te han asignado el incidente: ${payload.title}`,
          payload.incidentId,
          {
            assignedBy: payload.assignedById,
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Error notifying incident.assigned: ${error.message}`,
      );
    }
  }

  /**
   * Escuchar: incident.status_changed
   * Notificar a usuarios interesados (creador, asignado)
   */
  @OnEvent('incident.status_changed')
  async onIncidentStatusChanged(payload: Record<string, unknown>) {
    try {
      const reporterId = payload.citizen_id as string | undefined;
      const assigneeId = payload.assigned_to as string | undefined | null;
      const recipientIds = [reporterId, assigneeId].filter(
        (id): id is string => Boolean(id),
      );

      for (const userId of recipientIds) {
        const user = await this.usersService.findOne(userId);
        if (user?.id) {
          await this.notificationsService.notify(
            user,
            NotificationType.INCIDENT_STATUS_CHANGED,
            `Estado del incidente actualizado: ${payload.status}`,
            payload.id as string,
            {
              status: payload.status,
            },
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error notifying incident.status_changed: ${error.message}`,
      );
    }
  }

  /**
   * Escuchar: comment.added
   * Notificar a usuarios que siguen el incidente
   */
  @OnEvent('comment.added')
  async onCommentAdded(payload: Record<string, unknown>) {
    try {
      const reporterId = payload.reporter_id as string | undefined;
      const priorCommenterIds = (payload.prior_commenter_ids as string[] | undefined) ?? [];
      const recipientIds = [reporterId, ...priorCommenterIds].filter(
        (id): id is string => Boolean(id),
      );

      for (const userId of recipientIds) {
        if (userId === payload.author_id) continue; // No notificar al autor

        const user = await this.usersService.findOne(userId);
        if (user?.id) {
          await this.notificationsService.notify(
            user,
            NotificationType.COMMENT_ADDED,
            `Nuevo comentario en el incidente`,
            payload.incident_id as string,
            {
              commentId: payload.id as string,
              author: payload.author_id as string,
            },
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error notifying comment.added: ${error.message}`,
      );
    }
  }
}
