import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
import { RateLimiterGuard, buildRateLimitKey } from './rate-limiter.guard';

interface RequestOverrides {
  authorization?: string;
  ip?: string;
  path?: string;
}

function makeContext({
  authorization,
  ip = '203.0.113.7',
  path = '/api/incidents',
}: RequestOverrides = {}): ExecutionContext {
  const request = {
    headers: authorization ? { authorization } : {},
    ip,
    path,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeConfig(maxRequests: number, windowSeconds = 60): ConfigService {
  return {
    get: (namespace: string) =>
      namespace === 'auth'
        ? { jwtAccessSecret: 'access-secret' }
        : { rateLimit: { maxRequests, windowSeconds } },
  } as unknown as ConfigService;
}

/** Verifies only tokens shaped `valid:<sub>`; anything else throws, as a real
 *  JwtService would for a bad signature. */
function makeJwtService(): JwtService {
  return {
    verify: (token: string) => {
      if (!token.startsWith('valid:')) {
        throw new Error('invalid signature');
      }
      return { sub: token.slice('valid:'.length), typ: 'access' };
    },
  } as unknown as JwtService;
}

describe('buildRateLimitKey (pure function)', () => {
  it('builds a key including identity, route, and the current minute bucket', () => {
    const fixedNow = new Date('2026-08-15T10:23:45.000Z').getTime();
    const key = buildRateLimitKey('user:u-1', '/api/incidents', fixedNow);

    const expectedBucket = Math.floor(fixedNow / 1000 / 60);
    expect(key).toBe(`rate-limit:user:u-1:/api/incidents:${expectedBucket}`);
  });

  it('produces a DIFFERENT key for a different identity on the same route/minute', () => {
    const fixedNow = new Date('2026-08-15T10:23:45.000Z').getTime();

    expect(buildRateLimitKey('user:u-1', '/api/incidents', fixedNow)).not.toBe(
      buildRateLimitKey('user:u-2', '/api/incidents', fixedNow),
    );
  });
});

describe('RateLimiterGuard', () => {
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let guard: RateLimiterGuard;

  beforeEach(() => {
    cacheManager = { get: jest.fn(), set: jest.fn() };
    guard = new RateLimiterGuard(cacheManager as unknown as jest.Mocked<Cache>, makeConfig(3), makeJwtService());
  });

  function keyUsed(): string {
    return cacheManager.set.mock.calls[0][0] as string;
  }

  describe('identity', () => {
    // The guard previously keyed on an `x-device-uuid` header that nothing
    // ever sent, so every caller in the system shared one bucket.
    it('keys authenticated callers by the verified token subject', async () => {
      cacheManager.get.mockResolvedValue(0);

      await guard.canActivate(makeContext({ authorization: 'Bearer valid:user-1' }));

      expect(keyUsed()).toContain('user:user-1');
    });

    it('gives two authenticated users separate buckets on the same route', async () => {
      cacheManager.get.mockResolvedValue(0);

      await guard.canActivate(makeContext({ authorization: 'Bearer valid:user-1' }));
      await guard.canActivate(makeContext({ authorization: 'Bearer valid:user-2' }));

      const [first, second] = cacheManager.set.mock.calls.map((call) => call[0]);
      expect(first).not.toBe(second);
    });

    it('falls back to client IP when the request is unauthenticated', async () => {
      cacheManager.get.mockResolvedValue(0);

      await guard.canActivate(makeContext({ ip: '198.51.100.4' }));

      expect(keyUsed()).toContain('ip:198.51.100.4');
    });

    // An unverified `sub` is attacker-controlled: accepting it would let
    // anyone drain another user's quota by forging their id.
    it('ignores a token that fails verification and falls back to IP', async () => {
      cacheManager.get.mockResolvedValue(0);

      await guard.canActivate(
        makeContext({ authorization: 'Bearer forged:victim-1', ip: '198.51.100.4' }),
      );

      expect(keyUsed()).toContain('ip:198.51.100.4');
      expect(keyUsed()).not.toContain('victim-1');
    });

    it('separates the same identity across different routes', async () => {
      cacheManager.get.mockResolvedValue(0);

      await guard.canActivate(
        makeContext({ authorization: 'Bearer valid:user-1', path: '/api/incidents' }),
      );
      await guard.canActivate(
        makeContext({ authorization: 'Bearer valid:user-1', path: '/api/comments' }),
      );

      const [first, second] = cacheManager.set.mock.calls.map((call) => call[0]);
      expect(first).not.toBe(second);
    });
  });

  describe('limiting', () => {
    it('allows the request through when under the configured limit', async () => {
      cacheManager.get.mockResolvedValue(1);

      const allowed = await guard.canActivate(makeContext());

      expect(allowed).toBe(true);
      expect(cacheManager.set).toHaveBeenCalledWith(expect.any(String), 2, expect.any(Number));
    });

    it('rejects with 429 once the count reaches the limit (limit=3)', async () => {
      cacheManager.get.mockResolvedValue(3);

      await expect(guard.canActivate(makeContext())).rejects.toThrow(HttpException);
      await expect(guard.canActivate(makeContext())).rejects.toMatchObject({ status: 429 });
    });

    it('starts a fresh count of 1 when no prior entry exists', async () => {
      cacheManager.get.mockResolvedValue(undefined);

      const allowed = await guard.canActivate(makeContext());

      expect(allowed).toBe(true);
      expect(cacheManager.set).toHaveBeenCalledWith(expect.any(String), 1, expect.any(Number));
    });
  });
});
