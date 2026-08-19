import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { SESSION_REDIS_CLIENT } from '../../core/core.module';

export interface BufferedTokenPair {
  access_token: string;
  refresh_token: string;
}

function graceKey(sid: string, tokenHash: string): string {
  return `sess:grace:${sid}:${tokenHash}`;
}

/**
 * GraceBuffer (T3.9 design §2/§7 [R3]) — buffers the newly-issued pair
 * under the RETIRING token's hash for `sessionRefreshGraceSeconds`, so a
 * concurrent loser (or a client retrying a lost response) can replay it
 * verbatim without any Postgres write. The DB `previous_refresh_token_hash`
 * + `rotated_at` columns remain the authority — a Redis key surviving past
 * its TTL cannot extend the window past `rotated_at + grace` because the
 * caller ANDs a buffer hit with `isWithinRotationGrace` first.
 */
@Injectable()
export class GraceBuffer {
  private readonly logger = new Logger(GraceBuffer.name);

  constructor(@Inject(SESSION_REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Sets the new buffer entry and clears the predecessor's key in one
   * pipeline (design §2 "written") — so exactly one generation is ever
   * replayable. `previousTokenHash` is the hash the retiring token itself
   * replaced (i.e. two generations back) — `null` on a session's first
   * rotation, when there is no predecessor key to clear.
   */
  async set(
    sid: string,
    retiringTokenHash: string,
    pair: BufferedTokenPair,
    ttlSeconds: number,
    previousTokenHash: string | null,
  ): Promise<void> {
    if (ttlSeconds <= 0) {
      // grace === 0 (spec): skip the write entirely so every replay misses
      // and revokes — unmitigated reuse detection, exactly.
      return;
    }
    try {
      const pipeline = this.redis.pipeline();
      pipeline.setex(graceKey(sid, retiringTokenHash), Math.ceil(ttlSeconds), JSON.stringify(pair));
      if (previousTokenHash !== null) {
        pipeline.del(graceKey(sid, previousTokenHash));
      }
      await pipeline.exec();
    } catch (err) {
      this.logger.error(`GraceBuffer.set failed: ${(err as Error).message}`);
    }
  }

  async get(sid: string, presentedTokenHash: string): Promise<BufferedTokenPair | null> {
    try {
      const value = await this.redis.get(graceKey(sid, presentedTokenHash));
      if (value === null) {
        return null;
      }
      return JSON.parse(value) as BufferedTokenPair;
    } catch (err) {
      this.logger.warn(`GraceBuffer.get failed (treated as a miss): ${(err as Error).message}`);
      return null;
    }
  }

  async clear(sid: string, tokenHash: string): Promise<void> {
    try {
      await this.redis.del(graceKey(sid, tokenHash));
    } catch (err) {
      this.logger.warn(`GraceBuffer.clear failed: ${(err as Error).message}`);
    }
  }
}
