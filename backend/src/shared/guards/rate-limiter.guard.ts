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
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
import { AuthConfig } from '../../config/auth.config';
import { CacheConfig } from '../../config/cache.config';

/**
 * Builds the rate-limit cache key.
 * Format: `rate-limit:{identity}:{route}:{timestamp-minute}` (T1.3 spec).
 * Pure function — no side effects — easy to unit test in isolation.
 */
export function buildRateLimitKey(
  identity: string,
  route: string,
  nowMs: number = Date.now(),
): string {
  const minuteBucket = Math.floor(nowMs / 1000 / 60);
  return `rate-limit:${identity}:${route}:${minuteBucket}`;
}

/**
 * RateLimiterGuard (CC1) — Redis-backed sliding-minute rate limiting per
 * caller per route. 429 once the ceiling is exceeded. Default 100 req/min
 * (RATE_LIMIT_MAX_REQUESTS).
 *
 * Identity resolution, in order:
 *   1. `sub` from a **verified** access token — the authenticated user.
 *   2. Client IP — for unauthenticated routes (login, health).
 *
 * The token is verified rather than merely decoded: an unverified `sub` is
 * attacker-controlled, so anyone could exhaust another user's quota by
 * forging their id. This guard is registered as APP_GUARD and therefore runs
 * *before* the route-level JwtAuthGuard, so `request.user` is not populated
 * yet — verifying here is the only way to know who is calling.
 */
@Injectable()
export class RateLimiterGuard implements CanActivate {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const identity = this.resolveIdentity(request);
    const route: string = request.path ?? request.url ?? 'unknown';

    const { rateLimit } = this.configService.get<CacheConfig>('cache')!;
    const key = buildRateLimitKey(identity, route);

    const current = (await this.cache.get<number>(key)) ?? 0;

    if (current >= rateLimit.maxRequests) {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.cache.set(key, current + 1, rateLimit.windowSeconds * 1000);
    return true;
  }

  private resolveIdentity(request: {
    headers?: Record<string, unknown>;
    ip?: string;
    socket?: { remoteAddress?: string };
  }): string {
    const userId = this.userIdFromToken(request.headers?.authorization);
    if (userId) {
      return `user:${userId}`;
    }

    return `ip:${request.ip ?? request.socket?.remoteAddress ?? 'unknown'}`;
  }

  private userIdFromToken(authorization: unknown): string | null {
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      return null;
    }

    const { jwtAccessSecret } = this.configService.get<AuthConfig>('auth')!;

    try {
      const payload = this.jwtService.verify<{ sub?: string; typ?: string }>(
        authorization.slice('Bearer '.length),
        { secret: jwtAccessSecret },
      );
      return payload.typ === 'access' ? (payload.sub ?? null) : null;
    } catch {
      // Invalid or expired token — fall back to IP so a caller cannot dodge
      // the limiter by sending garbage in the Authorization header.
      return null;
    }
  }
}
