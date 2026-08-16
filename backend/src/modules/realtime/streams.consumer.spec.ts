import { Logger } from '@nestjs/common';
import { RealtimeStreamsConsumer, RETRY_BACKOFF_MS } from './streams.consumer';
import { EventsGateway } from './events.gateway';

describe('RealtimeStreamsConsumer', () => {
  let redis: { xgroup: jest.Mock; xreadgroup: jest.Mock; xack: jest.Mock; quit: jest.Mock };
  let gateway: { broadcast: jest.Mock };
  let consumer: RealtimeStreamsConsumer;

  beforeEach(() => {
    redis = { xgroup: jest.fn(), xreadgroup: jest.fn(), xack: jest.fn(), quit: jest.fn().mockResolvedValue('OK') };
    gateway = { broadcast: jest.fn() };
    consumer = new RealtimeStreamsConsumer(redis as Partial<typeof redis>, gateway as unknown as EventsGateway);
  });

  describe('processResponse', () => {
    it('decodes each entry and broadcasts it via the gateway, then XACKs', () => {
      const response: [string, [string, string[]][]][] = [
        [
          'incidents:events',
          [
            [
              '1-0',
              ['type', 'incident.created', 'data', JSON.stringify({ id: 'inc-1', zone_id: 'z1' })],
            ],
          ],
        ],
      ];

      consumer.processResponse(response);

      expect(gateway.broadcast).toHaveBeenCalledWith('incident.created', { id: 'inc-1', zone_id: 'z1' });
      expect(redis.xack).toHaveBeenCalledWith('incidents:events', 'realtime', '1-0');
    });

    it('still XACKs an entry that fails to decode (never re-delivers a poison message forever)', () => {
      const response: [string, [string, string[]][]][] = [
        ['incidents:events', [['2-0', ['type', 'incident.created', 'data', 'not-json']]]],
      ];

      consumer.processResponse(response);

      expect(gateway.broadcast).not.toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith('incidents:events', 'realtime', '2-0');
    });

    it('processes multiple entries across multiple streams in one response', () => {
      const response: [string, [string, string[]][]][] = [
        [
          'incidents:events',
          [
            ['1-0', ['type', 'incident.created', 'data', JSON.stringify({ id: 'a' })]],
            ['2-0', ['type', 'incident.status_changed', 'data', JSON.stringify({ id: 'b' })]],
          ],
        ],
      ];

      consumer.processResponse(response);

      expect(gateway.broadcast).toHaveBeenCalledTimes(2);
      expect(redis.xack).toHaveBeenCalledTimes(2);
    });
  });
});

describe('RealtimeStreamsConsumer — loop resilience', () => {
  let redis: { xgroup: jest.Mock; xreadgroup: jest.Mock; xack: jest.Mock; quit: jest.Mock };
  let consumer: RealtimeStreamsConsumer;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    redis = { xgroup: jest.fn(), xreadgroup: jest.fn(), xack: jest.fn(), quit: jest.fn().mockResolvedValue('OK') };
    consumer = new RealtimeStreamsConsumer(redis as Partial<typeof redis>, { broadcast: jest.fn() } as Partial<EventsGateway>);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await consumer.onModuleDestroy();
    jest.useRealTimers();
    errorSpy.mockRestore();
  });

  // onModuleDestroy flips `running`, but the loop is parked inside
  // XREADGROUP with BLOCK 5000. Redis then closes under it and the rejection
  // surfaces as an error — making every ordinary deploy look like an incident.
  it('does not log an error when the connection closes during shutdown', async () => {
    redis.xreadgroup.mockImplementation(() => {
      void consumer.onModuleDestroy();
      return Promise.reject(new Error('Connection is closed.'));
    });

    await consumer.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Without a backoff the catch retries instantly: a Redis outage burns CPU
  // and floods the logs instead of waiting for recovery.
  it('backs off between retries instead of spinning hot', async () => {
    redis.xreadgroup.mockRejectedValue(new Error('ECONNREFUSED'));

    await consumer.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);

    const afterFirstFailure = redis.xreadgroup.mock.calls.length;
    await jest.advanceTimersByTimeAsync(RETRY_BACKOFF_MS * 3);

    expect(afterFirstFailure).toBeLessThanOrEqual(2);
    expect(redis.xreadgroup.mock.calls.length).toBeLessThanOrEqual(afterFirstFailure + 4);
  });
});
