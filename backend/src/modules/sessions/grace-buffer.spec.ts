import type Redis from 'ioredis';
import { GraceBuffer } from './grace-buffer';

describe('GraceBuffer (T3.9 design §2/§7 [R3])', () => {
  let pipeline: { setex: jest.Mock; del: jest.Mock; exec: jest.Mock };
  let redis: { get: jest.Mock; del: jest.Mock; pipeline: jest.Mock };
  let buffer: GraceBuffer;
  const pair = { access_token: 'access.jwt', refresh_token: 'refresh.jwt' };

  beforeEach(() => {
    pipeline = { setex: jest.fn(), del: jest.fn(), exec: jest.fn().mockResolvedValue([]) };
    pipeline.setex.mockReturnValue(pipeline);
    pipeline.del.mockReturnValue(pipeline);
    redis = { get: jest.fn(), del: jest.fn(), pipeline: jest.fn(() => pipeline) };
    buffer = new GraceBuffer(redis as unknown as Redis);
  });

  describe('set/get round-trip', () => {
    it('sets a key under sess:grace:{sid}:{retiringTokenHash} and reads it back', async () => {
      await buffer.set('sid-1', 'retiring-hash', pair, 30, null);

      expect(pipeline.setex).toHaveBeenCalledWith(
        'sess:grace:sid-1:retiring-hash',
        30,
        JSON.stringify(pair),
      );
      expect(pipeline.del).not.toHaveBeenCalled();

      redis.get.mockResolvedValue(JSON.stringify(pair));
      const result = await buffer.get('sid-1', 'retiring-hash');

      expect(redis.get).toHaveBeenCalledWith('sess:grace:sid-1:retiring-hash');
      expect(result).toEqual(pair);
    });

    it('DELs the predecessor key in the same pipeline when provided', async () => {
      await buffer.set('sid-1', 'retiring-hash', pair, 30, 'predecessor-hash');

      expect(pipeline.del).toHaveBeenCalledWith('sess:grace:sid-1:predecessor-hash');
    });

    it('miss returns null', async () => {
      redis.get.mockResolvedValue(null);

      await expect(buffer.get('sid-1', 'unknown-hash')).resolves.toBeNull();
    });

    it('a Redis error on get is treated as a miss, never throws', async () => {
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(buffer.get('sid-1', 'hash')).resolves.toBeNull();
    });
  });

  describe('grace === 0 (spec: skip the write entirely)', () => {
    it('does not call pipeline at all when ttlSeconds is 0', async () => {
      await buffer.set('sid-1', 'retiring-hash', pair, 0, null);

      expect(redis.pipeline).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('DELs the given key', async () => {
      await buffer.clear('sid-1', 'old-hash');

      expect(redis.del).toHaveBeenCalledWith('sess:grace:sid-1:old-hash');
    });

    it('never throws even when the Redis call fails', async () => {
      redis.del.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(buffer.clear('sid-1', 'old-hash')).resolves.toBeUndefined();
    });
  });
});
