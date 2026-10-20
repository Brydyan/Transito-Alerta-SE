import { Logger } from '@nestjs/common';

import { NotificationType } from '../entities/notification.entity';
import { IncidentNotificationsListener } from './incident-notifications.listener';

/**
 * 2026-10-20 — Este listener NO tenía spec. Tres de sus cuatro handlers
 * nunca habían funcionado, y el patrón se repite: cada uno declaraba un
 * contrato que el productor nunca cumplió, y ninguno fallaba en runtime.
 *
 *   - `incident.created` pedía el rol `'admin'`, nombre muerto desde el
 *     rename (`admin_org`): `findByRole('admin')` devolvía `[]` siempre.
 *   - `comment.added` leía `reporter_id`, `prior_commenter_ids`,
 *     `author_id` e `incident_id`; `CommentsService` publica la fila de
 *     `CommentEntity` (`id`, `content`, `incidentId`, `userId`).
 *
 * La razón por la que no había spec es la razón por la que los bugs no se
 * detectaban: un spec que fabrica el payload que el handler DESEA no puede
 * detectar un desajuste con el que el PRODUCTOR emite. Por eso cada
 * payload de este archivo lleva el comentario de en qué línea del código
 * real se construye, y todos son copies literales —camelCase donde el
 * productor publica camelCase, snake_case donde publica snake_case.
 */

/** `CommentsService.create()` emite la entidad tal cual (`comments.service.ts:66`). */
const COMMENT_FROM_PRODUCER = {
  id: 'cmt-1',
  content: 'Ya llego la patrulla',
  incidentId: 'inc-1',
  userId: 'op-1',
  parentId: null,
  deletedAt: null,
};

/** `IncidentsService.publish('incident.created', row)` publica la fila cruda. */
const INCIDENT_CREATED_FROM_PRODUCER = {
  id: 'inc-1',
  title: 'Accidente en la avenida',
  priority: 'critical',
  zone_id: 'zone-1',
  organization_id: 'org-1',
  citizen_id: 'citizen-1',
};

describe('IncidentNotificationsListener', () => {
  let listener: IncidentNotificationsListener;
  let notificationsService: { notify: jest.Mock };
  let usersService: { findOne: jest.Mock; findActiveByRoleInOrganization: jest.Mock };
  let dataSource: { query: jest.Mock };
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    notificationsService = { notify: jest.fn().mockResolvedValue(null) };
    usersService = {
      findOne: jest.fn().mockImplementation(async (id: string) => ({ id })),
      findActiveByRoleInOrganization: jest.fn().mockResolvedValue([]),
    };
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    listener = new IncidentNotificationsListener(
      notificationsService as never,
      usersService as never,
      dataSource as never,
    );
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('incident.created', () => {
    it('notifica a los admin_org de la organización de la incidencia', async () => {
      usersService.findActiveByRoleInOrganization.mockResolvedValue([
        { id: 'admin-a' },
        { id: 'admin-b' },
      ]);

      await listener.onIncidentCreated(INCIDENT_CREATED_FROM_PRODUCER);

      // El nombre del rol es el dato que estuvo muerto: con `'admin'` esta
      // lista salía vacía siempre y nadie era notificado.
      expect(usersService.findActiveByRoleInOrganization).toHaveBeenCalledWith(
        'admin_org',
        'org-1',
      );
      expect(notificationsService.notify).toHaveBeenCalledTimes(2);
      expect(notificationsService.notify).toHaveBeenCalledWith(
        { id: 'admin-a' },
        NotificationType.INCIDENT_CREATED,
        'Nuevo incidente: Accidente en la avenida',
        'inc-1',
        { createdBy: 'citizen-1' },
      );
    });

    it('sin organization_id NO busca admins ni notifica (no hay audiencia)', async () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

      await listener.onIncidentCreated({
        ...INCIDENT_CREATED_FROM_PRODUCER,
        organization_id: null,
      });

      expect(usersService.findActiveByRoleInOrganization).not.toHaveBeenCalled();
      expect(notificationsService.notify).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalled();
      debugSpy.mockRestore();
    });

    it('un fallo al resolver los admins no propaga (el bus no debe romperse)', async () => {
      usersService.findActiveByRoleInOrganization.mockRejectedValue(new Error('db down'));

      await expect(
        listener.onIncidentCreated(INCIDENT_CREATED_FROM_PRODUCER),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });
  });

  describe('incident.assigned', () => {
    it('notifica al operador con el título del payload', async () => {
      await listener.onIncidentAssigned({
        incidentId: 'inc-1',
        assignedToId: 'op-1',
        assignedById: 'admin-a',
        title: 'Accidente en la avenida',
      });

      expect(usersService.findOne).toHaveBeenCalledWith('op-1');
      expect(notificationsService.notify).toHaveBeenCalledWith(
        { id: 'op-1' },
        NotificationType.INCIDENT_ASSIGNED,
        'Te han asignado el incidente: Accidente en la avenida',
        'inc-1',
        { assignedBy: 'admin-a' },
      );
    });
  });

  describe('incident.status_changed', () => {
    it('avisa a reportador y asignado, y EXCLUYE al actor del cambio', async () => {
      dataSource.query.mockResolvedValue([{ user_id: 'follower-1' }]);

      await listener.onIncidentStatusChanged({
        id: 'inc-1',
        title: 'Accidente en la avenida',
        status: 'in_progress',
        citizen_id: 'citizen-1',
        assigned_to: 'op-1',
        actor_id: 'admin-a',
      });

      const notified = notificationsService.notify.mock.calls.map((c) => c[0].id);
      expect(notified.sort()).toEqual(['citizen-1', 'follower-1', 'op-1']);
      // El actor ya sabe que lo hizo: avisarle es ruido.
      expect(notified).not.toContain('admin-a');
    });
  });

  describe('comment.added', () => {
    /** La fila que devuelve `resolveCommentAudience`. */
    function audienceRow(row: {
      reporter_id: string | null;
      prior_commenter_ids: string[];
    }): void {
      dataSource.query.mockResolvedValue([row]);
    }

    it('notifica al reportador y a quienes ya comentaron, excluyendo al autor', async () => {
      // `op-1` es el AUTOR del comentario (`COMMENT_FROM_PRODUCER.userId`),
      // así que la lista correcta de previos es `op-2`, no `op-1`.
      audienceRow({
        reporter_id: 'citizen-1',
        prior_commenter_ids: ['op-2'],
      });

      await listener.onCommentAdded(COMMENT_FROM_PRODUCER);

      const notified = notificationsService.notify.mock.calls.map((c) => c[0].id);
      expect(notified.sort()).toEqual(['citizen-1', 'op-2']);
      expect(notificationsService.notify).toHaveBeenCalledWith(
        { id: 'citizen-1' },
        NotificationType.COMMENT_ADDED,
        'Nuevo comentario en el incidente',
        'inc-1',
        { commentId: 'cmt-1', author: 'op-1' },
      );
    });

    it('el autor NO se notifica a sí mismo aunque esté en la audiencia', async () => {
      // El evento se emite DESPUÉS del insert, así que el autor ya está en
      // la tabla y `array_agg` lo devolvería si no se excluyera en la query.
      // El filtro del handler es la segunda red, no la única.
      audienceRow({
        reporter_id: 'op-1',
        prior_commenter_ids: ['op-1', 'citizen-1'],
      });

      await listener.onCommentAdded(COMMENT_FROM_PRODUCER);

      const notified = notificationsService.notify.mock.calls.map((c) => c[0].id);
      expect(notified).toEqual(['citizen-1']);
    });

    it('pasa la incidencia y el autor a la resolución de audiencia', async () => {
      audienceRow({ reporter_id: null, prior_commenter_ids: [] });

      await listener.onCommentAdded(COMMENT_FROM_PRODUCER);

      expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('citizen_id'), [
        'inc-1',
        'op-1',
      ]);
    });

    it('una incidencia sin audiencia no notifica a nadie', async () => {
      audienceRow({ reporter_id: null, prior_commenter_ids: [] });

      await listener.onCommentAdded(COMMENT_FROM_PRODUCER);

      expect(usersService.findOne).not.toHaveBeenCalled();
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });
  });
});