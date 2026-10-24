import { Logger } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { Redis } from 'ioredis';
import { IncidentMailListener, INCIDENT_MAIL_CONSUMER_GROUP } from './incident-mail.listener';
import { MailService } from './mail.service';
import { INCIDENTS_STREAM_KEY } from '../incidents/incidents.service';
import { UserEntity } from '../users/entities/user.entity';

function streamResponse(type: string, data: unknown, entryId = '1-0'): [string, [string, string[]][]][] {
  return [[INCIDENTS_STREAM_KEY, [[entryId, ['type', type, 'data', JSON.stringify(data)]]]]];
}

describe('IncidentMailListener', () => {
  let redis: { xgroup: jest.Mock; xreadgroup: jest.Mock; xack: jest.Mock; quit: jest.Mock };
  let mailService: { enqueue: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let dataSource: { query: jest.Mock };
  let listener: IncidentMailListener;

  beforeEach(() => {
    redis = { xgroup: jest.fn(), xreadgroup: jest.fn(), xack: jest.fn(), quit: jest.fn().mockResolvedValue('OK') };
    mailService = { enqueue: jest.fn().mockResolvedValue('1-0') };
    userRepo = { findOne: jest.fn() };
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    listener = new IncidentMailListener(
      redis as unknown as jest.Mocked<Redis>,
      mailService as unknown as MailService,
      userRepo as unknown as jest.Mocked<Repository<UserEntity>>,
      dataSource as unknown as DataSource,
    );
  });

  describe('onModuleInit', () => {
    it('creates the mail consumer group on incidents:events (split group, per D7/D8)', async () => {
      redis.xreadgroup.mockResolvedValue(null);
      await listener.onModuleInit();
      await listener.onModuleDestroy();

      expect(redis.xgroup).toHaveBeenCalledWith('CREATE', INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, '$', 'MKSTREAM');
    });
  });

  describe('processResponse — routing table (D10)', () => {
    it('incident.created (critical, with org) -> enqueues only to admin_org of that org, never the reporter', async () => {
      // F7 emergency-dispatch (post-Round-2) — the reporter never
      // gets an "acuse" of their own report; mail only fires for
      // critical incidents and only to the admin_org users of the
      // resolved organisation.
      dataSource.query.mockResolvedValueOnce([
        { email: 'admin1@example.com' },
        { email: 'admin2@example.com' },
      ]);

      await listener.processResponse(
        streamResponse('incident.created', {
          id: 'inc-1',
          title: 'Choque múltiple',
          description: 'Vehículos bloqueando carril',
          priority: 'critical',
          organization_id: 'org-1',
          citizen_id: 'reporter-1', // must NOT trigger any email
        }),
      );

      // Resolver was queried with the right SQL and the org id.
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("r.name = 'admin_org'"),
        ['org-1'],
      );
      // reporter never enqueued
      expect(mailService.enqueue).not.toHaveBeenCalledWith(
        expect.objectContaining({ to: 'reporter@example.com' }),
      );
      // admin_org users of the org ARE enqueued
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin1@example.com', template: 'incident.created' }),
      );
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin2@example.com', template: 'incident.created' }),
      );
      expect(mailService.enqueue).toHaveBeenCalledTimes(2);
      // subject reflects it's a critical report
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Critical incident reported: Choque múltiple'),
        }),
      );
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, '1-0');
    });

    it('incident.created (priority != critical) -> no mail enqueued at all', async () => {
      // Low/medium/high priority: by design, no mass email on creation.
      // The reporter never gets an acuse regardless of priority.
      await listener.processResponse(
        streamResponse('incident.created', {
          id: 'inc-2',
          title: 'Bache leve',
          description: 'Calle secundaria',
          priority: 'high',
          organization_id: 'org-1',
          citizen_id: 'reporter-1',
        }),
      );

      expect(mailService.enqueue).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, '1-0');
    });

    it('incident.created (critical but organization_id missing) -> no mail, debug log', async () => {
      // Critical incident that did not resolve an organisation
      // (e.g. no zone match) has no audience. No mail; debug log only.
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

      await listener.processResponse(
        streamResponse('incident.created', {
          id: 'inc-3',
          title: 'Emergencia sin zona',
          priority: 'critical',
          organization_id: null,
          citizen_id: 'reporter-1',
        }),
      );

      expect(mailService.enqueue).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('incident.created: critical incident inc-3 has no organization'),
      );
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, '1-0');
      debugSpy.mockRestore();
    });

    it('incident.created (critical) -> admin_org users without email are skipped silently', async () => {
      // The DB can return rows with `email = null` (e.g. user invited
      // by phone only). The filter is client-side so this matches
      // `enqueueToEmails`'s contract.
      dataSource.query.mockResolvedValueOnce([
        { email: 'admin1@example.com' },
        { email: null },
        { email: 'admin3@example.com' },
      ]);

      await listener.processResponse(
        streamResponse('incident.created', {
          id: 'inc-4',
          title: 'Accidente crítico',
          priority: 'critical',
          organization_id: 'org-2',
        }),
      );

      expect(mailService.enqueue).toHaveBeenCalledTimes(2);
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin1@example.com' }),
      );
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin3@example.com' }),
      );
    });

    it('incident.assigned -> enqueues to the assignee only, with the incident title in the subject', async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: 'op-1', email: 'operator@example.com' });

      // El payload refleja la FORMA REAL que emite `assignments.service.ts`
      // (commit del payload compartido): la fila de `assignments` más los
      // datos de la incidencia. Antes este test pasaba un payload sin
      // `title` y por eso nunca notó que el subject salía vacío — el
      // productor mandaba `saved` pelado al stream. El contrato
      // productor↔consumidor de esto lo verifica
      // `backend/test/e2e/mail.e2e-spec.ts` (HTTP de verdad); aquí se
      // comprueba que el título llegue al subject cuando está.
      await listener.processResponse(
        streamResponse(
          'incident.assigned',
          {
            id: 'a-1',
            incidentId: 'inc-1',
            operatorId: 'op-1',
            assignedToId: 'op-1',
            title: 'Pozo abierto en la calzada',
            description: 'Pozo de 40cm junto al paso peatonal',
            priority: 'high',
          },
          '2-0',
        ),
      );

      expect(mailService.enqueue).toHaveBeenCalledTimes(1);
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'operator@example.com',
          template: 'incident.assigned',
          subject: 'Incident assigned to you: Pozo abierto en la calzada',
          data: { title: 'Pozo abierto en la calzada' },
        }),
      );
    });

    it('incident.assigned sin title -> cae al incidentId en el subject (nunca queda vacío)', async () => {
      // La rama `data.title ?? data.incidentId` del subject. Un entry viejo
      // en el stream —o un productor que no enriquezca el payload— no puede
      // producir `Incident assigned to you: ` a secas.
      userRepo.findOne.mockResolvedValueOnce({ id: 'op-1', email: 'operator@example.com' });

      await listener.processResponse(
        streamResponse('incident.assigned', { id: 'a-1', incidentId: 'inc-1', operatorId: 'op-1' }, '2-1'),
      );

      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'operator@example.com',
          subject: 'Incident assigned to you: inc-1',
        }),
      );
    });

    it('incident.status_changed -> enqueues to the reporter and the assignee', async () => {
      userRepo.findOne
        .mockResolvedValueOnce({ id: 'reporter-1', email: 'reporter@example.com' })
        .mockResolvedValueOnce({ id: 'op-1', email: 'operator@example.com' });

      await listener.processResponse(
        streamResponse(
          'incident.status_changed',
          { id: 'inc-1', title: 'Choque', status: 'resolved', citizen_id: 'reporter-1', assigned_to: 'op-1' },
          '3-0',
        ),
      );

      expect(mailService.enqueue).toHaveBeenCalledTimes(2);
    });

    it('un `comment.added` que llegue al STREAM no se enruta a ningún correo', async () => {
      // El test que estaba aquí antes afirmaba que `comment.created`
      // encolaba correo al reportador y a los previos comentadores. Era
      // falso de las dos maneras: el evento real es `comment.added`, y
      // `CommentsService` publica sólo por EventEmitter — nunca hace XADD
      // a `incidents:events`. El test fabricaba su propio input y por eso
      // llevaba meses verde sobre un handler que no podía dispararse.
      //
      // Este fija el contrato REAL: el stream no enruta comentarios. El
      // handler vive en `onCommentAdded`, sobre el bus.
      await listener.processResponse(
        streamResponse(
          'comment.added',
          { id: 'c-1', incidentId: 'inc-1', userId: 'op-1', content: 'hola' },
          '4-0',
        ),
      );

      expect(mailService.enqueue).not.toHaveBeenCalled();
      // Aun así se XACK-ea: una entrada que no se enruta no puede dejar
      // pendientes creciendo para siempre.
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, '4-0');
    });

    it('a recipient with no email is skipped (debug log, no retry, no enqueue for that recipient)', async () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
      userRepo.findOne.mockResolvedValueOnce({ id: 'op-1', email: null });

      await listener.processResponse(
        streamResponse('incident.assigned', { id: 'a-1', incidentId: 'inc-1', operatorId: 'op-1' }, '5-0'),
      );

      expect(mailService.enqueue).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, '5-0');
      debugSpy.mockRestore();
    });

    it('always XACKs, even for an event type it does not route (no infinite pending growth)', async () => {
      await listener.processResponse(streamResponse('incident.unrelated_type', {}, '6-0'));

      expect(mailService.enqueue).not.toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, '6-0');
    });

    it('XACKs a poison (undecodable) entry without throwing', async () => {
      await listener.processResponse([[INCIDENTS_STREAM_KEY, [['7-0', ['type', 'incident.created', 'data', 'not-json']]]]]);

      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, '7-0');
    });
  });

  describe('onCommentAdded — @OnEvent("comment.added")', () => {
    it('encola al reportador y a los previos comentarios con el contenido del payload', async () => {
      dataSource.query.mockResolvedValueOnce([
        { reporter_id: 'reporter-1', prior_commenter_ids: ['commenter-1'] },
      ]);
      userRepo.findOne
        .mockResolvedValueOnce({ id: 'reporter-1', email: 'reporter@example.com' })
        .mockResolvedValueOnce({ id: 'commenter-1', email: 'commenter1@example.com' });

      // Payload real: la fila de `CommentEntity` que emite
      // `CommentsService.create()` (comments.service.ts:66). Los campos son
      // camelCase porque la entidad lo es — el test anterior usaba
      // `incident_id`/`author_id`, que no existen en ninguna parte.
      await listener.onCommentAdded({
        id: 'c-1',
        incidentId: 'inc-1',
        userId: 'op-1',
        content: 'Ya llego la patrulla',
        parentId: null,
        // `deletedAt`/timestamps no los usa el handler.
      });

      expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('citizen_id'), [
        'inc-1',
        'op-1',
      ]);
      expect(mailService.enqueue).toHaveBeenCalledTimes(2);
      expect(mailService.enqueue).toHaveBeenCalledWith({
        to: 'reporter@example.com',
        subject: 'New comment on your incident',
        template: 'comment.created',
        data: { content: 'Ya llego la patrulla' },
      });
    });

    it('no encola nada cuando la incidencia no tiene audiencia', async () => {
      dataSource.query.mockResolvedValueOnce([
        { reporter_id: null, prior_commenter_ids: [] },
      ]);

      await listener.onCommentAdded({
        id: 'c-1',
        incidentId: 'inc-1',
        userId: 'op-1',
        content: 'hola',
        parentId: null,
        // `deletedAt`/timestamps no los usa el handler.
      });

      expect(userRepo.findOne).not.toHaveBeenCalled();
      expect(mailService.enqueue).not.toHaveBeenCalled();
    });
  });
});
