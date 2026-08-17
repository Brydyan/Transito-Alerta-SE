import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

import { INCIDENTS_STREAM_KEY } from '../incidents/incidents.service';
import {
  IncidentStatusHistoryListener,
  STATUS_HISTORY_CONSUMER_GROUP,
} from './incident-status-history.listener';
import { StatusHistoryRepository } from './status-history.repository';

function statusChangedFields(overrides: Partial<Record<string, unknown>> = {}): string[] {
  const data = {
    id: 'incident-1',
    actor_id: 'user-1',
    previous_status: 'pending',
    status: 'in_progress',
    ...overrides,
  };
  return ['type', 'incident.status_changed', 'data', JSON.stringify(data)];
}

function pgError(code: string, message = 'db error'): Error {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

describe('IncidentStatusHistoryListener', () => {
  let redis: {
    xgroup: jest.Mock;
    xreadgroup: jest.Mock;
    xack: jest.Mock;
    xpending: jest.Mock;
    xclaim: jest.Mock;
    quit: jest.Mock;
  };
  let statusHistoryRepository: { insert: jest.Mock };
  let config: { get: jest.Mock };
  let listener: IncidentStatusHistoryListener;

  beforeEach(() => {
    redis = {
      xgroup: jest.fn(),
      xreadgroup: jest.fn(),
      xack: jest.fn(),
      xpending: jest.fn(),
      xclaim: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
    };
    statusHistoryRepository = { insert: jest.fn() };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, number> = {
          STATUS_HISTORY_XREADGROUP_BLOCK_MS: 1000,
          STATUS_HISTORY_SWEEP_INTERVAL_MS: 300,
          STATUS_HISTORY_CLAIM_IDLE_MS: 500,
          STATUS_HISTORY_MAX_ATTEMPTS: 5,
        };
        return values[key];
      }),
    };
    listener = new IncidentStatusHistoryListener(
      redis as unknown as jest.Mocked<Redis>,
      statusHistoryRepository as unknown as StatusHistoryRepository,
      config as unknown as ConfigService,
    );
  });

  describe('onModuleInit / onModuleDestroy', () => {
    it('creates the status-history consumer group with $ + MKSTREAM', async () => {
      redis.xreadgroup.mockResolvedValue(null);
      await listener.onModuleInit();
      await listener.onModuleDestroy();

      expect(redis.xgroup).toHaveBeenCalledWith(
        'CREATE',
        INCIDENTS_STREAM_KEY,
        STATUS_HISTORY_CONSUMER_GROUP,
        '$',
        'MKSTREAM',
      );
    });

    it('tolerates BUSYGROUP without logging an error', async () => {
      redis.xgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists'));
      redis.xreadgroup.mockResolvedValue(null);
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await listener.onModuleInit();
      await listener.onModuleDestroy();

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('onModuleDestroy stops the loop, clears the sweep timer and quits the connection', async () => {
      redis.xreadgroup.mockResolvedValue(null);
      await listener.onModuleInit();
      await listener.onModuleDestroy();

      expect(redis.quit).toHaveBeenCalled();
    });
  });

  describe('processEntry — D3 ACK decision table', () => {
    it('undecodable payload -> ACK + warn', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await listener.processEntry('1-0', ['garbage']);

      expect(statusHistoryRepository.insert).not.toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, '1-0');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('irrelevant event type -> ACK, no insert', async () => {
      await listener.processEntry(
        '2-0',
        ['type', 'incident.created', 'data', JSON.stringify({ id: 'incident-1' })],
      );

      expect(statusHistoryRepository.insert).not.toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, '2-0');
    });

    it('bad payload (missing previous_status) -> ACK + error, no insert', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await listener.processEntry(
        '3-0',
        statusChangedFields({ previous_status: undefined }),
      );

      expect(statusHistoryRepository.insert).not.toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, '3-0');
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('bad payload (previous_status === new_status) -> ACK + error, no insert', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await listener.processEntry(
        '3-1',
        statusChangedFields({ previous_status: 'pending', status: 'pending' }),
      );

      expect(statusHistoryRepository.insert).not.toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, '3-1');
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('insert returns 1 row -> ACK', async () => {
      statusHistoryRepository.insert.mockResolvedValue([{ id: 'row-1' }]);

      await listener.processEntry('4-0', statusChangedFields());

      expect(statusHistoryRepository.insert).toHaveBeenCalledWith({
        incidentId: 'incident-1',
        changedByUserId: 'user-1',
        previousStatus: 'pending',
        newStatus: 'in_progress',
        eventId: '4-0',
      });
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, '4-0');
    });

    it('insert returns 0 rows (conflict / already recorded) -> ACK', async () => {
      statusHistoryRepository.insert.mockResolvedValue([]);

      await listener.processEntry('5-0', statusChangedFields());

      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, '5-0');
    });

    it.each(['23503', '23514', '23502', '22P02'])(
      'permanent PG error %s -> ACK + error',
      async (code) => {
        statusHistoryRepository.insert.mockRejectedValue(pgError(code));
        const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

        await listener.processEntry('6-0', statusChangedFields());

        expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, '6-0');
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
      },
    );

    it('transient DB error (e.g. connection failure) -> no ACK, left PENDING', async () => {
      statusHistoryRepository.insert.mockRejectedValue(pgError('ECONNREFUSED', 'connection refused'));
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await listener.processEntry('7-0', statusChangedFields());

      expect(redis.xack).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('processResponse', () => {
    it('processes every entry in the XREADGROUP response', async () => {
      statusHistoryRepository.insert.mockResolvedValue([{ id: 'row-1' }]);
      const response = [
        [
          INCIDENTS_STREAM_KEY,
          [
            ['1-0', statusChangedFields()] as [string, string[]],
            ['2-0', statusChangedFields({ id: 'incident-2' })] as [string, string[]],
          ],
        ],
      ] as unknown as [string, [string, string[]][]][];

      await listener.processResponse(response);

      expect(statusHistoryRepository.insert).toHaveBeenCalledTimes(2);
      expect(redis.xack).toHaveBeenCalledTimes(2);
    });
  });

  describe('sweep — reachable without onModuleInit (D4)', () => {
    it('reclaims and processes an entry below the attempt cap', async () => {
      redis.xpending.mockResolvedValue([['8-0', 'dead-consumer', 40_000, 2]]);
      redis.xclaim.mockResolvedValue([['8-0', statusChangedFields()]]);
      statusHistoryRepository.insert.mockResolvedValue([{ id: 'row-1' }]);

      await listener.sweep();

      expect(redis.xclaim).toHaveBeenCalled();
      expect(statusHistoryRepository.insert).toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, '8-0');
    });

    it('deliveryCount >= 5 -> ACK + error, no xclaim (poison-pill escape)', async () => {
      redis.xpending.mockResolvedValue([['9-0', 'dead-consumer', 300_000, 5]]);
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await listener.sweep();

      expect(redis.xclaim).not.toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, '9-0');
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('no pending entries -> no-op', async () => {
      redis.xpending.mockResolvedValue([]);

      await listener.sweep();

      expect(redis.xclaim).not.toHaveBeenCalled();
      expect(redis.xack).not.toHaveBeenCalled();
    });
  });
});
