import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { SESSION_REDIS_CLIENT } from '../../core/core.module';

function revokedKey(sid: string): string {
  return `sess:revoked:${sid}`;
}

/**
 * RevocationCache (T3.9 design §2/D1) — the per-`sid` denylist. Absence of
 * a key means "not revoked" (D1) — the set only ever holds revoked,
 * unexpired sessions (boot-warmed + written on every `revoke()`).
 *
 * Fail-open (D1b): any Redis error (including the 50ms `commandTimeout` on
 * `SESSION_REDIS_CLIENT` firing) is caught and `isRevoked` resolves
 * `false` — it NEVER throws, and NEVER blocks a request behind a hung
 * connection. A bounded staleness window (at most `JWT_ACCESS_EXPIRES_IN`)
 * is accepted rather than turning a cache outage into a total auth outage.
 */
@Injectable()
export class RevocationCache {
  private readonly logger = new Logger(RevocationCache.name);

  constructor(@Inject(SESSION_REDIS_CLIENT) private readonly redis: Redis) {}

  async isRevoked(sid: string): Promise<boolean> {
    try {
      const value = await this.redis.get(revokedKey(sid));
      return value !== null;
    } catch (err) {
      this.logger.warn(`RevocationCache.isRevoked fail-open on error: ${(err as Error).message}`);
      return false;
    }
  }

  /** `ttlSeconds` MUST be the session's remaining refresh lifetime (spec "Revocation"). */
  async revoke(sid: string, ttlSeconds: number): Promise<void> {
    const safeTtl = Math.max(1, Math.ceil(ttlSeconds));
    try {
      await this.redis.setex(revokedKey(sid), safeTtl, '1');
    } catch (err) {
      // A failed denylist write does not fail the caller's revoke — the DB
      // row's own revoked_at is the authority (design §2); this is only the
      // fast-path per-request check.
      this.logger.error(`RevocationCache.revoke failed to write denylist entry: ${(err as Error).message}`);
    }
  }
}
