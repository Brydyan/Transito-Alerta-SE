import type Redis from 'ioredis';
import { RevocationCache } from './revocation-cache';

describe('RevocationCache (T3.9 design §2/D1/D1b)', () => {
  let redis: { get: jest.Mock; setex: jest.Mock };
  let cache: RevocationCache;

  beforeEach(() => {
    redis = { get: jest.fn(), setex: jest.fn() };
    cache = new RevocationCache(redis as unknown as Redis);
  });

  describe('isRevoked', () => {
    it('GETs the sess:revoked:{sid} key', async () => {
      redis.get.mockResolvedValue(null);

      await cache.isRevoked('sid-1');

      expect(redis.get).toHaveBeenCalledWith('sess:revoked:sid-1');
    });

    it('returns true on a hit', async () => {
      redis.get.mockResolvedValue('1');

      await expect(cache.isRevoked('sid-1')).resolves.toBe(true);
    });

    it('returns false on a miss (absence = not revoked, D1)', async () => {
      redis.get.mockResolvedValue(null);

      await expect(cache.isRevoked('sid-1')).resolves.toBe(false);
    });

    it('fail-open contract: a rejecting Redis client resolves false, never throws', async () => {
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cache.isRevoked('sid-1')).resolves.toBe(false);
    });
  });

  describe('revoke', () => {
    it('SETEXes the key with the given TTL', async () => {
      redis.setex.mockResolvedValue('OK');

      await cache.revoke('sid-1', 604800);

      expect(redis.setex).toHaveBeenCalledWith('sess:revoked:sid-1', 604800, '1');
    });

    it('never throws even when the Redis write fails', async () => {
      redis.setex.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cache.revoke('sid-1', 100)).resolves.toBeUndefined();
    });

    it('clamps a non-positive TTL to at least 1 second', async () => {
      redis.setex.mockResolvedValue('OK');

      await cache.revoke('sid-1', -5);

      expect(redis.setex).toHaveBeenCalledWith('sess:revoked:sid-1', 1, '1');
    });
  });
});
