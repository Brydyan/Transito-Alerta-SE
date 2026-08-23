import type Redis from 'ioredis';
import { OperatorLocationService } from './operator-location.service';

describe('OperatorLocationService', () => {
  let redis: {
    hset: jest.Mock;
    expire: jest.Mock;
    hgetall: jest.Mock;
    keys: jest.Mock;
  };
  let service: OperatorLocationService;

  beforeEach(() => {
    redis = {
      hset: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      hgetall: jest.fn().mockResolvedValue({}),
      keys: jest.fn().mockResolvedValue([]),
    };
    service = new OperatorLocationService(redis as unknown as Redis);
  });

  describe('record', () => {
    it('calls HSET with correct key and serialized value', async () => {
      await service.record('user-1', 'org-1', -31.4, -64.1);

      expect(redis.hset).toHaveBeenCalledWith(
        'operators:loc:org-1',
        'user-1',
        expect.stringContaining('"lat":-31.4'),
      );
    });

    it('calls EXPIRE with TTL 300 after HSET', async () => {
      await service.record('user-1', 'org-1', -31.4, -64.1);

      expect(redis.expire).toHaveBeenCalledWith('operators:loc:org-1', 300);
    });

    it('second call overwrites entry (HSET) and resets TTL', async () => {
      await service.record('user-1', 'org-1', -31.4, -64.1);
      await service.record('user-1', 'org-1', -32.0, -65.0);

      expect(redis.hset).toHaveBeenCalledTimes(2);
      expect(redis.expire).toHaveBeenCalledTimes(2);
      const secondCall = (redis.hset.mock.calls[1] as [string, string, string])[2];
      expect(JSON.parse(secondCall)).toMatchObject({ lat: -32.0, lng: -65.0 });
    });
  });

  describe('activeFor', () => {
    it('returns only entries for the given org (non-admin)', async () => {
      const entry = JSON.stringify({
        userId: 'user-1',
        organizationId: 'org-1',
        lat: -31.4,
        lng: -64.1,
        updatedAt: new Date().toISOString(),
      });
      redis.hgetall.mockResolvedValue({ 'user-1': entry });

      const result = await service.activeFor('org-1', false);

      expect(redis.hgetall).toHaveBeenCalledWith('operators:loc:org-1');
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
    });

    it('aggregates across multiple org keys for system admin', async () => {
      const entryA = JSON.stringify({
        userId: 'u-a',
        organizationId: 'org-a',
        lat: 0,
        lng: 0,
        updatedAt: new Date().toISOString(),
      });
      const entryB = JSON.stringify({
        userId: 'u-b',
        organizationId: 'org-b',
        lat: 1,
        lng: 1,
        updatedAt: new Date().toISOString(),
      });
      redis.keys.mockResolvedValue(['operators:loc:org-a', 'operators:loc:org-b']);
      redis.hgetall
        .mockResolvedValueOnce({ 'u-a': entryA })
        .mockResolvedValueOnce({ 'u-b': entryB });

      const result = await service.activeFor(null, true);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.userId)).toContain('u-a');
      expect(result.map((r) => r.userId)).toContain('u-b');
    });

    it('returns empty array when hash is empty', async () => {
      redis.hgetall.mockResolvedValue({});

      const result = await service.activeFor('org-empty', false);

      expect(result).toEqual([]);
    });

    it('returns empty array when orgId is null and not system admin', async () => {
      const result = await service.activeFor(null, false);

      expect(redis.hgetall).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
