import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { TELEGRAM_BLOCKING_CLIENT } from '../../infra/core.module';
import { TelegramConfig } from '../../config/telegram.config';
import {
  TELEGRAM_DEAD_STREAM_KEY,
  TELEGRAM_OUTBOX_STREAM_KEY,
  TelegramService,
} from './telegram.service';

export const TELEGRAM_OUTBOX_CONSUMER_GROUP = 'telegram';
export const RETRY_BACKOFF_MS = 1000;

type XPendingRow = [string, string, number, number];
type XClaimEntry = [string, string[]];

/**
 * TelegramOutboxConsumer (F7 emergency-dispatch, design D5/D8) — structural
 * mirror of `MailOutboxConsumer`: same loop shape (XREADGROUP BLOCK + COUNT,
 * per-entry XACK), same sweep (XPENDING + XCLAIM + maxAttempts → dead
 * stream), same OnModuleDestroy cleanup. Reusing the same shape across
 * transports is the point of choosing Streams over BullMQ.
 *
 * Token hygiene (D8): this consumer NEVER logs the body of an outbound
 * send. The URL carries the token; the entry fields on the stream are
 * chat_id + text + parse_mode, all safe to log. Sweep errors log only
 * entry ids + error messages, not field values.
 */
@Injectable()
export class TelegramOutboxConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramOutboxConsumer.name);
  readonly consumerName = `telegram-consumer-${process.pid}-${Math.random().toString(36).slice(2)}`;
  private running = false;
  private sweeping = false;
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(TELEGRAM_BLOCKING_CLIENT) private readonly redis: Redis,
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.xgroup(
        'CREATE',
        TELEGRAM_OUTBOX_STREAM_KEY,
        TELEGRAM_OUTBOX_CONSUMER_GROUP,
        '$',
        'MKSTREAM',
      );
    } catch (err) {
      if ((err as Error).message?.includes('BUSYGROUP')) {
        await this.redis.xgroup(
          'SETID',
          TELEGRAM_OUTBOX_STREAM_KEY,
          TELEGRAM_OUTBOX_CONSUMER_GROUP,
          '$',
        );
      } else {
        this.logger.error(
          `Failed to create telegram consumer group: ${(err as Error).message}`,
        );
      }
    }

    this.running = true;
    void this.loop();

    const cfg = this.configService.get<TelegramConfig>('telegram')!;
    this.sweepTimer = setInterval(() => void this.sweep(), cfg.sweepIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await this.redis.quit().catch(() => undefined);
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const blockTimeoutMs =
          this.configService.get<number>('TELEGRAM_XREADGROUP_BLOCK_MS') ?? 5000;
        const response = await this.redis.xreadgroup(
          'GROUP',
          TELEGRAM_OUTBOX_CONSUMER_GROUP,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          blockTimeoutMs,
          'STREAMS',
          TELEGRAM_OUTBOX_STREAM_KEY,
          '>',
        );
        if (response) {
          const entries = response as unknown as [string, [string, string[]][]][];
          await this.processResponse(entries);
        }
      } catch (err) {
        if (!this.running) break;
        this.logger.error(`Telegram outbox loop error: ${(err as Error).message}`);
        await this.sleep(RETRY_BACKOFF_MS);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async processResponse(response: [string, [string, string[]][]][]): Promise<void> {
    for (const [, entries] of response) {
      for (const [entryId, fields] of entries) {
        await this.processEntry(entryId, fields);
      }
    }
  }

  async processEntry(entryId: string, fields: string[]): Promise<void> {
    const map = this.decode(fields);
    const chatId = map.chat_id;
    const text = map.text;
    const parseMode = (map.parse_mode || undefined) as 'HTML' | 'MarkdownV2' | undefined;

    if (!chatId || !text) {
      this.logger.error(`[processEntry] ${entryId} missing chat_id or text, dead-lettering`);
      await this.deadLetter(entryId, fields);
      return;
    }

    try {
      await this.telegramService.deliver(chatId, text, parseMode);
      await this.redis.xack(
        TELEGRAM_OUTBOX_STREAM_KEY,
        TELEGRAM_OUTBOX_CONSUMER_GROUP,
        entryId,
      );
    } catch (err) {
      // Transport failure (DNS, 5xx, network) — leave pending, sweep reclaims.
      this.logger.error(
        `[processEntry] ${entryId} FAILED: ${(err as Error).message}`,
      );
    }
  }

  private async deadLetter(entryId: string, fields: string[]): Promise<void> {
    this.logger.error(
      `[deadLetter] Entry ${entryId} moved to ${TELEGRAM_DEAD_STREAM_KEY} (data defect)`,
    );
    // Cap to ~1000 entries (same reasoning as mail/consumer).
    await this.redis.xadd(
      TELEGRAM_DEAD_STREAM_KEY,
      'MAXLEN',
      '~',
      '1000',
      '*',
      ...fields,
    );
    await this.redis.xack(
      TELEGRAM_OUTBOX_STREAM_KEY,
      TELEGRAM_OUTBOX_CONSUMER_GROUP,
      entryId,
    );
  }

  private decode(fields: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]] = fields[i + 1];
    }
    return map;
  }

  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.sweepImpl();
    } finally {
      this.sweeping = false;
    }
  }

  private async sweepImpl(): Promise<void> {
    const cfg = this.configService.get<TelegramConfig>('telegram')!;
    let pending: XPendingRow[];
    try {
      pending = (await this.redis.xpending(
        TELEGRAM_OUTBOX_STREAM_KEY,
        TELEGRAM_OUTBOX_CONSUMER_GROUP,
        'IDLE',
        cfg.claimIdleMs,
        '-',
        '+',
        10,
      )) as unknown as XPendingRow[];
    } catch (err) {
      if (this.running) {
        this.logger.error(`Sweep XPENDING failed: ${(err as Error).message}`);
      }
      return;
    }

    if (!pending || pending.length === 0) return;

    for (const [entryId, , , deliveryCount] of pending) {
      if (deliveryCount >= cfg.maxAttempts) {
        try {
          await this.deadLetterById(entryId);
        } catch (err) {
          this.logger.error(
            `Sweep deadLetterById failed for ${entryId}: ${(err as Error).message}`,
          );
        }
        continue;
      }
      try {
        const claimed = (await this.redis.xclaim(
          TELEGRAM_OUTBOX_STREAM_KEY,
          TELEGRAM_OUTBOX_CONSUMER_GROUP,
          this.consumerName,
          cfg.claimIdleMs,
          entryId,
        )) as unknown as XClaimEntry[];
        if (claimed && claimed.length > 0) {
          const [, fields] = claimed[0];
          await this.processEntry(entryId, fields);
        }
      } catch (err) {
        this.logger.error(`Sweep XCLAIM failed for ${entryId}: ${(err as Error).message}`);
      }
    }
  }

  private async deadLetterById(entryId: string): Promise<void> {
    const range = (await this.redis.xrange(
      TELEGRAM_OUTBOX_STREAM_KEY,
      entryId,
      entryId,
    )) as unknown as XClaimEntry[];
    if (range.length === 0) return;

    const [, fields] = range[0];
    try {
      await this.redis.xadd(TELEGRAM_DEAD_STREAM_KEY, '*', ...fields);
    } catch (err) {
      this.logger.error(
        `deadLetterById XADD failed for ${entryId}: ${(err as Error).message}`,
      );
      return;
    }
    try {
      await this.redis.xdel(TELEGRAM_OUTBOX_STREAM_KEY, entryId);
    } catch (err) {
      this.logger.error(
        `deadLetterById XDEL failed for ${entryId}: ${(err as Error).message}`,
      );
    }
    try {
      await this.redis.xack(
        TELEGRAM_OUTBOX_STREAM_KEY,
        TELEGRAM_OUTBOX_CONSUMER_GROUP,
        entryId,
      );
    } catch (err) {
      const errMsg = (err as Error).message;
      if (errMsg?.includes('Connection is closed')) return;
      if (errMsg?.includes('NOGROUP')) {
        if (!this.running) return;
        throw err;
      }
    }
  }
}
