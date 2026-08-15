import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimiterGuard, buildRateLimitKey } from './rate-limiter.guard';

function makeContext(deviceUuid: string, path = '/api/incidents'): ExecutionContext {
  const request = {
    headers: { 'x-device-uuid': deviceUuid },
    path,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function makeConfig(maxRequests: number, windowSeconds = 60): ConfigService {
  return {
    get: () => ({ rateLimit: { maxRequests, windowSeconds } }),
  } as unknown as ConfigService;
}

describe('buildRateLimitKey (pure function)', () => {
  it('builds a key including device, route, and the current timestamp-minute bucket', () => {
    const fixedNow = new Date('2026-08-15T10:23:45.000Z').getTime();
    const key = buildRateLimitKey('device-123', '/api/incidents', fixedNow);

    // Minute bucket for 10:23 UTC is floor(epoch-seconds / 60)
    const expectedBucket = Math.floor(fixedNow / 1000 / 60);
    expect(key).toBe(`rate-limit:device-123:/api/incidents:${expectedBucket}`);
  });

  it('produces a DIFFERENT key for a different device on the same route/minute', () => {
    const fixedNow = new Date('2026-08-15T10:23:45.000Z').getTime();
    const keyA = buildRateLimitKey('device-123', '/api/incidents', fixedNow);
    const keyB = buildRateLimitKey('device-456', '/api/incidents', fixedNow);

    expect(keyA).not.toBe(keyB);
  });
});

describe('RateLimiterGuard', () => {
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let guard: RateLimiterGuard;

  beforeEach(() => {
    cacheManager = { get: jest.fn(), set: jest.fn() };
    guard = new RateLimiterGuard(cacheManager as any, makeConfig(3));
  });

  it('allows the request through when under the configured limit', async () => {
    cacheManager.get.mockResolvedValue(1);

    const allowed = await guard.canActivate(makeContext('device-A'));

    expect(allowed).toBe(true);
    expect(cacheManager.set).toHaveBeenCalledWith(expect.any(String), 2, expect.any(Number));
  });

  it('rejects with 429 once the request count exceeds the configured limit (triangulation: limit=3)', async () => {
    cacheManager.get.mockResolvedValue(3); // already at the limit

    await expect(guard.canActivate(makeContext('device-A'))).rejects.toThrow(HttpException);
    await expect(guard.canActivate(makeContext('device-A'))).rejects.toMatchObject({
      status: 429,
    });
  });

  it('starts a fresh count of 1 for a device/route combo with no prior cache entry', async () => {
    cacheManager.get.mockResolvedValue(undefined);

    const allowed = await guard.canActivate(makeContext('device-B'));

    expect(allowed).toBe(true);
    expect(cacheManager.set).toHaveBeenCalledWith(expect.any(String), 1, expect.any(Number));
  });
});
