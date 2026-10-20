import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service';
import { UsersService } from '../../users/users.service';
import { NotificationType } from '../entities/notification.entity';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { resolveCommentAudience } from '../../../shared/events/comment-audience';

@Injectable()
export class IncidentNotificationsListener {
  private readonly logger = new Logger(IncidentNotificationsListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Escuchar: incident.created
   * Notificar a los admin_org de la organización del incidente
   *
   * 2026-10-20 — el payload pasa en snake_case porque así lo emite
   * `IncidentsService.publish()` (`incidents.service.ts:170`), que publica
   * la fila cruda. Antes se declaraba `{ incidentId, createdById, title,
   * location }` en camelCase: `incidentId` y `createdById` llegaban
   * `undefined` y la notificación salía sin autor.
   *
   * Y antes de eso, esto NUNCA notificó a nadie: pedía el rol `'admin'`,
   * un nombre que no existe desde el rename de roles (`admin_org`), así
   * que `findByRole('admin')` devolvía `[]` siempre. El nombre viejo se
   * había quedado en el código mientras el resto del sistema migraba.
   *
   * `findByRole` además NO filtra por organización, así que arreglar sólo
   * el nombre habría avisado a los admins de todas las orgs. La audiencia
   * correcta replica la del listener de mail
   * (`incident-mail.listener.ts:getOrgAdminEmails`): `admin_org` de la
   * organización a la que la incidencia quedó asignada.
   *
   * Ojo: `onIncidentStatusChanged` YA usaba snake_case y es correcto — el
   * archivo mezcla convenciones porque cada handler se escribió en un momento
   * distinto. `AssignmentsService` (2026-10-20) ahora publica un payload
   * completo por `incident.assigned`, así que aquí ya no hay que adivinar
   * nombres.
   */
  @OnEvent('incident.created')
  async onIncidentCreated(payload: {
    id: string;
    title: string;
    citizen_id: string | null;
    organization_id: string | null;
  }) {
    try {
      const organizationId = payload.organization_id ?? null;
      if (!organizationId) {
        // Sin geofence la incidencia no pertenece a ninguna org: no hay
        // audiencia a la que avisar. Se registra en debug porque es una
        // decisión de negocio (critico sin zona), no un fallo.
        this.logger.debug(
          `incident.created: ${payload.id} has no organization; no admin_org in-app notification`,
        );
        return;
      }

      const admins = await this.usersService.findActiveByRoleInOrganization(
        'admin_org',
        organizationId,
      );

      for (const admin of admins) {
        if (admin?.id) {
          await this.notificationsService.notify(
            admin,
            NotificationType.INCIDENT_CREATED,
            `Nuevo incidente: ${payload.title}`,
            payload.id,
            {
              createdBy: payload.citizen_id ?? null,
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
   *
   * 2026-10-20 — esto NUNCA notificó. El listener pedía `assignedToId`, y
   * el emisor mandaba `operatorId`: `findOne(undefined)` devolvía null, el
   * `if (user?.id)` cortaba, y la notificación in-app al operador no se
   * creaba. Sin error, sin log — el síntoma era simplemente que asignar una
   * incidencia no le llegaba nada al operador dentro de la app.
   *
   * El emisor (`assignments.service.ts`) ahora publica `assignedToId`,
   * `assignedById` y `title` explícitamente y por los DOS canales
   * (EventEmitter y stream), así que este handler ya no depende de inferir
   * nombres a partir de la fila de `assignments`.
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
      
      const actorId = payload.actor_id as string | undefined; // We need to ensure actor_id is in payload
      
      const followers = await this.dataSource.query<{ user_id: string }[]>(
        'SELECT user_id FROM incident_followers WHERE incident_id = $1',
        [payload.id]
      );
      
      const followerIds = followers.map(f => f.user_id);

      const recipientIds = Array.from(new Set([
        ...([reporterId, assigneeId].filter(id => Boolean(id)) as string[]),
        ...followerIds
      ])).filter(id => id !== actorId); // EXCLUDE actor

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
   * Notificar al reportador y a quienes ya comentaron en la incidencia
   *
   * 2026-10-20 — esto NUNCA notificó. El handler leía `reporter_id`,
   * `prior_commenter_ids`, `author_id` e `incident_id`; `CommentsService`
   * publica la fila de `CommentEntity`, que se llama `id`, `content`,
   * `incidentId`, `userId`, `parentId`. Los cuatro campos devolvían
   * `undefined`, `recipientIds` quedaba vacío y el `for` no iteraba.
   *
   * El mismo patrón exacto del bug de `assignedToId`, y por la misma
   * razón: el unit spec —que aquí no existía— se habría dado su propio
   * payload. La audiencia se resuelve en
   * `shared/events/comment-audience.ts`, compartida con el canal de correo:
   * si cada consumidor define su propia copia, divergen sin que nada lo
   * note.
   */
  @OnEvent('comment.added')
  async onCommentAdded(payload: {
    id: string;
    incidentId: string;
    userId: string;
    content: string;
    parentId: string | null;
  }) {
    try {
      const audience = await resolveCommentAudience(
        this.dataSource,
        payload.incidentId,
        payload.userId,
      );

      const recipientIds = [
        audience.reporterId,
        ...audience.priorCommenterIds,
      ].filter(
        (id): id is string => Boolean(id) && id !== payload.userId,
      );

      for (const userId of recipientIds) {
        const user = await this.usersService.findOne(userId);
        if (user?.id) {
          await this.notificationsService.notify(
            user,
            NotificationType.COMMENT_ADDED,
            `Nuevo comentario en el incidente`,
            payload.incidentId,
            {
              commentId: payload.id,
              author: payload.userId,
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
