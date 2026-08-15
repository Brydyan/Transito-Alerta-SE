import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { CacheConfig } from '../../config/cache.config';

/**
 * Builds the rate-limit cache key.
 * Format: `rate-limit:{device_uuid}:{route}:{timestamp-minute}` (T1.3 spec).
 * Pure function — no side effects — easy to unit test in isolation.
 */
export function buildRateLimitKey(
  deviceUuid: string,
  route: string,
  nowMs: number = Date.now(),
): string {
  const minuteBucket = Math.floor(nowMs / 1000 / 60);
  return `rate-limit:${deviceUuid}:${route}:${minuteBucket}`;
}

/**
 * RateLimiterGuard — Redis-backed sliding-minute rate limiting per device_uuid
 * per route. Returns 429 once the configured request ceiling is exceeded.
 * Default: 100 req/min (configurable via RATE_LIMIT_MAX_REQUESTS).
 */
@Injectable()
export class RateLimiterGuard implements CanActivate {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const deviceUuid: string = request.headers?.['x-device-uuid'] ?? 'anonymous';
    const route: string = request.path ?? request.url ?? 'unknown';

    const { rateLimit } = this.configService.get<CacheConfig>('cache')!;
    const key = buildRateLimitKey(deviceUuid, route);

    const current = (await this.cache.get<number>(key)) ?? 0;

    if (current >= rateLimit.maxRequests) {
      throw new HttpException(
        'Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.cache.set(key, current + 1, rateLimit.windowSeconds * 1000);
    return true;
  }
}
