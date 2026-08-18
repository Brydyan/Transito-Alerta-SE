import type Redis from 'ioredis';
import { SessionsBootWarmService } from './sessions-boot-warm.service';
import { SessionsRepository } from './sessions.repository';

describe('SessionsBootWarmService (T3.9 design §2/§3.3)', () => {
  let sessionsRepository: { findRevokedUnexpired: jest.Mock };
  let pipeline: { set: jest.Mock; exec: jest.Mock };
  let redis: { pipeline: jest.Mock; connect: jest.Mock };
  let service: SessionsBootWarmService;

  beforeEach(() => {
    sessionsRepository = { findRevokedUnexpired: jest.fn() };
    pipeline = { set: jest.fn(), exec: jest.fn().mockResolvedValue([]) };
    pipeline.set.mockReturnValue(pipeline);
    redis = { pipeline: jest.fn(() => pipeline), connect: jest.fn().mockResolvedValue(undefined) };
    service = new SessionsBootWarmService(
      sessionsRepository as unknown as SessionsRepository,
      redis as unknown as Redis,
    );
  });

  it('does nothing when there are no revoked-unexpired sessions', async () => {
    sessionsRepository.findRevokedUnexpired.mockResolvedValue([]);

    await service.onApplicationBootstrap();

    expect(redis.pipeline).not.toHaveBeenCalled();
  });

  it('always forces the lazy Redis connection at boot, even with zero rows', async () => {
    sessionsRepository.findRevokedUnexpired.mockResolvedValue([]);

    await service.onApplicationBootstrap();

    expect(redis.connect).toHaveBeenCalledTimes(1);
  });

  it('does not abort boot when connect() rejects (already connecting, or unreachable)', async () => {
    redis.connect.mockRejectedValue(new Error('already connecting'));
    sessionsRepository.findRevokedUnexpired.mockResolvedValue([]);

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('pipelines a SET ... EX per revoked row with a ttl derived from expires_at', async () => {
    const now = Date.now();
    sessionsRepository.findRevokedUnexpired.mockResolvedValue([
      { id: 'sid-1', expires_at: new Date(now + 100_000) },
      { id: 'sid-2', expires_at: new Date(now + 5_000) },
    ]);

    await service.onApplicationBootstrap();

    expect(pipeline.set).toHaveBeenCalledTimes(2);
    expect(pipeline.set).toHaveBeenNthCalledWith(
      1,
      'sess:revoked:sid-1',
      '1',
      'EX',
      expect.any(Number),
    );
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
  });

  it('does not throw or abort boot when the repository call fails', async () => {
    sessionsRepository.findRevokedUnexpired.mockRejectedValue(new Error('DB down'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('does not throw or abort boot when the Redis pipeline fails', async () => {
    sessionsRepository.findRevokedUnexpired.mockResolvedValue([
      { id: 'sid-1', expires_at: new Date(Date.now() + 100_000) },
    ]);
    pipeline.exec.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
