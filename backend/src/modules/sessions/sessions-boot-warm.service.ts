import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type Redis from 'ioredis';

import { SESSION_REDIS_CLIENT } from '../../core/core.module';
import { SessionsRepository } from './sessions.repository';

/**
 * SessionsBootWarmService (T3.9 design §2/§3.3, precedent
 * `common/authz/role-rank.audit.ts`) — rebuilds the Redis denylist from
 * `user_sessions` at process boot: `revoked_at IS NOT NULL AND expires_at >
 * now()` (uses `idx_user_sessions_revoked`), one ioredis pipeline of `SET
 * sess:revoked:{id} 1 EX {ttl}` per row.
 *
 * Failure logs an error and does NOT abort boot (D1b is fail-open;
 * refusing to start is fail-closed by another name).
 *
 * Also forces the lazy `SESSION_REDIS_CLIENT` connection to establish here,
 * unconditionally — `enableOfflineQueue: false` (design §2) means the
 * FIRST command issued against a still-connecting lazy client is rejected
 * outright rather than queued. Without connecting proactively at boot, a
 * process with zero revoked sessions at startup would leave that gap open
 * until the first real `RevocationCache.revoke()`/`isRevoked()` call,
 * which could then silently fail-open on nothing more than cold-start
 * timing.
 */
@Injectable()
export class SessionsBootWarmService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SessionsBootWarmService.name);

  constructor(
    private readonly sessionsRepository: SessionsRepository,
    @Inject(SESSION_REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.redis.connect().catch(() => {
        // Already connecting/connected (ioredis throws if connect() is
        // called twice), or genuinely unreachable — either way, fail-open
        // (D1b) and let the pipeline below (or the next real call) retry.
      });

      const rows = await this.sessionsRepository.findRevokedUnexpired();
      if (rows.length === 0) {
        return;
      }

      const now = Date.now();
      const pipeline = this.redis.pipeline();
      for (const row of rows) {
        const ttlSeconds = Math.max(1, Math.ceil((row.expires_at.getTime() - now) / 1000));
        pipeline.set(`sess:revoked:${row.id}`, '1', 'EX', ttlSeconds);
      }
      await pipeline.exec();
      this.logger.log(`Warmed ${rows.length} revoked session(s) into the denylist`);
    } catch (err) {
      this.logger.error(`Boot-warm of the session denylist failed: ${(err as Error).message}`);
    }
  }
}
