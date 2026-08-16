import { Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { Redis } from 'ioredis';
import { IncidentMailListener, INCIDENT_MAIL_CONSUMER_GROUP } from './incident-mail.listener';
import { MailService } from './mail.service';
import { INCIDENTS_STREAM_KEY } from '../incidents/incidents.service';
import { UserEntity } from '../../entities/user.entity';

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
      dataSource as unknown as any,
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
    it('incident.created -> enqueues to the reporter and every active admin', async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: 'reporter-1', email: 'reporter@example.com' });
      dataSource.query.mockResolvedValueOnce([
        { id: 'admin-1', email: 'admin1@example.com' },
        { id: 'admin-2', email: 'admin2@example.com' },
      ]);

      await listener.processResponse(
        streamResponse('incident.created', { id: 'inc-1', title: 'Choque', citizen_id: 'reporter-1' }),
      );

      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'reporter@example.com', template: 'incident.created' }),
      );
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin1@example.com', template: 'incident.created' }),
      );
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin2@example.com', template: 'incident.created' }),
      );
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, '1-0');
    });

    it('incident.assigned -> enqueues to the assignee only', async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: 'op-1', email: 'operator@example.com' });

      await listener.processResponse(
        streamResponse('incident.assigned', { id: 'a-1', incidentId: 'inc-1', operatorId: 'op-1' }, '2-0'),
      );

      expect(mailService.enqueue).toHaveBeenCalledTimes(1);
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'operator@example.com', template: 'incident.assigned' }),
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

    it('comment.created -> enqueues to the incident reporter and prior commenters', async () => {
      userRepo.findOne
        .mockResolvedValueOnce({ id: 'reporter-1', email: 'reporter@example.com' })
        .mockResolvedValueOnce({ id: 'commenter-1', email: 'commenter1@example.com' });

      await listener.processResponse(
        streamResponse(
          'comment.created',
          {
            id: 'c-1',
            incident_id: 'inc-1',
            content: 'hola',
            reporter_id: 'reporter-1',
            prior_commenter_ids: ['commenter-1'],
          },
          '4-0',
        ),
      );

      expect(mailService.enqueue).toHaveBeenCalledTimes(2);
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
});
