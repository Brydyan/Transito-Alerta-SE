import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { REDIS_CLIENT } from '../../infra/core.module';
import { TelegramConfig } from '../../config/telegram.config';

/**
 * Redis key namespace for one-shot Telegram link tokens (D2).
 * `SET telegram:link:<token> <userId> EX 86400`.
 */
const LINK_KEY_PREFIX = 'telegram:link:';

/**
 * TelegramLinkService (2026-10-10-user-onboarding-telegram-tour, D2).
 *
 * The bot cannot reach the user first — Telegram requires the user
 * to `/start` the bot. To bind a real `chat_id` to a known user we
 * mint a single-use opaque token, store it in Redis with a 24h TTL,
 * put it in the `?start=<token>` query of the deep link, and
 * resolve the token when the webhook receives the `/start` command.
 *
 * Storage:
 *   - Key:   `telegram:link:<token>`
 *   - Value: `<userId>` (plain text — the token itself is the secret)
 *   - TTL:   `cfg.linkTokenTtlSeconds` (default 24h)
 *
 * The token is `randomBytes(24).toString('base64url')` (D2) — URL-safe,
 * 32 chars, 192 bits of entropy. The service never logs the token.
 */
@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  private get cfg(): TelegramConfig {
    return this.configService.get<TelegramConfig>('telegram')!;
  }

  /**
   * Mints a fresh token bound to `userId` and persists it in Redis
   * with the configured TTL. Returns the raw token (caller composes
   * the deep link).
   */
  async issueFor(userId: string): Promise<string> {
    const token = randomBytes(24).toString('base64url');
    await this.redis.set(
      `${LINK_KEY_PREFIX}${token}`,
      userId,
      'EX',
      this.cfg.linkTokenTtlSeconds,
    );
    return token;
  }

  /**
   * Resolves and atomically consumes a token. Returns the userId
   * associated with it, or `null` if the token is unknown or
   * already consumed. The DEL happens in the same call as the GET
   * via a Lua script so two concurrent `/start` calls cannot both
   * succeed (D2: "un solo uso").
   */
  async consume(token: string): Promise<string | null> {
    // Normalize: Telegram may URL-decode characters, but the
    // service received the raw token in the webhook text. Trim
    // whitespace defensively.
    const clean = token.trim();
    if (!clean) return null;

    const result = await this.redis.eval(
      // KEYS[1] = key, ARGV[1] = value-to-set-after-get
      //   GET-then-DEL atomically: read the current value, then
      //   delete the key. The return is the value that was there
      //   (or nil if there was no key).
      `local v = redis.call('GET', KEYS[1]);
       if v then redis.call('DEL', KEYS[1]) end;
       return v`,
      1,
      `${LINK_KEY_PREFIX}${clean}`,
    );

    if (result === null || result === undefined) return null;
    const userId = String(result);
    return userId.length > 0 ? userId : null;
  }

  /**
   * Builds the `https://t.me/<botUsername>?start=<token>` deep link
   * (D2). Returns `null` when the bot username is not configured —
   * the caller (email template, frontend banner) can then fall back
   * to a non-clickable instruction.
   */
  composeDeepLink(token: string): string | null {
    const username = this.cfg.botUsername;
    if (!username) return null;
    return `https://t.me/${username}?start=${token}`;
  }
}
