import { RealtimeStreamsConsumer } from './streams.consumer';
import { EventsGateway } from './events.gateway';

describe('RealtimeStreamsConsumer', () => {
  let redis: { xgroup: jest.Mock; xreadgroup: jest.Mock; xack: jest.Mock };
  let gateway: { broadcast: jest.Mock };
  let consumer: RealtimeStreamsConsumer;

  beforeEach(() => {
    redis = { xgroup: jest.fn(), xreadgroup: jest.fn(), xack: jest.fn() };
    gateway = { broadcast: jest.fn() };
    consumer = new RealtimeStreamsConsumer(redis as any, gateway as unknown as EventsGateway);
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
