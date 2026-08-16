import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { MAIL_BLOCKING_CLIENT } from '../../core/core.module';
import { MailConfig } from '../../config/mail.config';
import { MAIL_DEAD_STREAM_KEY, MAIL_OUTBOX_STREAM_KEY, MailService } from './mail.service';
import { TemplateName } from './templates/mail-templates';

export const MAIL_OUTBOX_CONSUMER_GROUP = 'mail';

/** Pause after a failed read so a Redis outage cannot spin the loop hot (mirrors streams.consumer.ts). */
export const RETRY_BACKOFF_MS = 1000;

type XPendingRow = [string, string, number, number];
type XClaimEntry = [string, string[]];

/**
 * MailOutboxConsumer (design D8/D12) — consumer group `mail` on
 * `mail:outbox`. Structurally mirrors `RealtimeStreamsConsumer` verbatim
 * (`OnModuleInit` group CREATE + MKSTREAM, `while(running)` loop with
 * `BLOCK 5000`, per-entry `xack`, `OnModuleDestroy` async `quit()`,
 * backoff on loop error) — reusing that shape is the point of choosing
 * Streams over BullMQ (D8). Adds an XPENDING/XCLAIM sweep on top: entries
 * a crashed/slow attempt left pending get reclaimed after `claimIdleMs`
 * and retried, up to `maxAttempts` (Redis's own native per-entry delivery
 * counter, incremented by XCLAIM on every reclaim) before moving to
 * `mail:dead`.
 */
@Injectable()
export class MailOutboxConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailOutboxConsumer.name);
  readonly consumerName = `mail-consumer-${process.pid}-${Math.random().toString(36).slice(2)}`;
  private running = false;
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    // Dedicated connection (D13): XREADGROUP ... BLOCK holds it, and
    // sharing it with MailService.enqueue's XADD or with
    // IncidentMailListener's own blocking read would queue every producer
    // write, and the two consumers' ack/retry semantics, behind each other.
    @Inject(MAIL_BLOCKING_CLIENT) private readonly redis: Redis,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, '$', 'MKSTREAM');
    } catch (err) {
      // BUSYGROUP: the group already exists — expected on every restart.
      if (!(err as Error).message?.includes('BUSYGROUP')) {
        this.logger.error(`Failed to create mail consumer group: ${(err as Error).message}`);
      }
    }
    this.running = true;
    void this.loop();

    const mailConfig = this.configService.get<MailConfig>('mail')!;
    this.sweepTimer = setInterval(() => void this.sweep(), mailConfig.sweepIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
    await this.redis.quit().catch(() => undefined);
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const response = await this.redis.xreadgroup(
          'GROUP',
          MAIL_OUTBOX_CONSUMER_GROUP,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          5000,
          'STREAMS',
          MAIL_OUTBOX_STREAM_KEY,
          '>',
        );
        if (response) {
          await this.processResponse(response as unknown as [string, [string, string[]][]][]);
        }
      } catch (err) {
        // A rejection during shutdown is the connection closing under a
        // blocked XREADGROUP, not a fault (mirrors streams.consumer.ts).
        if (!this.running) {
          break;
        }
        this.logger.error(`Mail outbox consumer loop error: ${(err as Error).message}`);
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

  /**
   * Delivers a single entry. Three outcomes (design D12):
   *  - success            -> XACK.
   *  - data defect         -> straight to `mail:dead` + XACK (never retryable).
   *  - transport failure   -> left pending, untouched (the sweep reclaims it).
   */
  async processEntry(entryId: string, fields: string[]): Promise<void> {
    const map = this.decode(fields);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(map.data ?? '');
    } catch {
      await this.deadLetter(entryId, fields);
      return;
    }

    try {
      await this.mailService.deliver(map.to, map.subject, map.template as TemplateName, data);
      await this.redis.xack(MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, entryId);
    } catch (err) {
      if ((err as Error).message?.startsWith('Unknown mail template')) {
        await this.deadLetter(entryId, fields);
        return;
      }
      // Transport failure (SMTP connect/send) — leave pending, the sweep
      // will XCLAIM and retry it.
      this.logger.warn(`Delivery failed for ${entryId}, left pending for retry: ${(err as Error).message}`);
    }
  }

  private async deadLetter(entryId: string, fields: string[]): Promise<void> {
    this.logger.error(`Entry ${entryId} moved to ${MAIL_DEAD_STREAM_KEY} (unretryable)`);
    await this.redis.xadd(MAIL_DEAD_STREAM_KEY, '*', ...fields);
    await this.redis.xack(MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, entryId);
  }

  private decode(fields: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]] = fields[i + 1];
    }
    return map;
  }

  /**
   * XPENDING (extended form) -> per-entry idle time + Redis's native
   * delivery count. At `maxAttempts` an entry moves straight to
   * `mail:dead` without another claim; otherwise XCLAIM re-delivers it to
   * this consumer and `processEntry` retries the send.
   */
  async sweep(): Promise<void> {
    const mailConfig = this.configService.get<MailConfig>('mail')!;
    let pending: XPendingRow[];
    try {
      pending = (await this.redis.xpending(
        MAIL_OUTBOX_STREAM_KEY,
        MAIL_OUTBOX_CONSUMER_GROUP,
        'IDLE',
        mailConfig.claimIdleMs,
        '-',
        '+',
        10,
      )) as unknown as XPendingRow[];
    } catch (err) {
      // Suppress logging connection errors during shutdown.
      if (this.running) {
        this.logger.error(`Sweep XPENDING failed: ${(err as Error).message}`);
      }
      return;
    }

    if (!pending || pending.length === 0) {
      return;
    }

    for (const [entryId, , , deliveryCount] of pending) {
      if (deliveryCount >= mailConfig.maxAttempts) {
        try {
          await this.deadLetterById(entryId);
        } catch (err) {
          this.logger.error(`Sweep deadLetterById failed for ${entryId}: ${(err as Error).message}`);
        }
        continue;
      }

      try {
        const claimed = (await this.redis.xclaim(
          MAIL_OUTBOX_STREAM_KEY,
          MAIL_OUTBOX_CONSUMER_GROUP,
          this.consumerName,
          mailConfig.claimIdleMs,
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
    const range = (await this.redis.xrange(MAIL_OUTBOX_STREAM_KEY, entryId, entryId)) as unknown as XClaimEntry[];
    if (range.length > 0) {
      const [, fields] = range[0];
      this.logger.error(`Entry ${entryId} exhausted retries, moved to ${MAIL_DEAD_STREAM_KEY}`);
      await this.redis.xadd(MAIL_DEAD_STREAM_KEY, '*', ...fields);
    }
    // XACK may fail if connection is closing, but entry is already in dead letter.
    // Best effort: log warning if ACK fails, don't re-throw during shutdown.
    try {
      await this.redis.xack(MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, entryId);
    } catch (err) {
      if (this.running) {
        throw err;
      }
      // During shutdown, connection closing is expected. Don't re-throw.
    }
  }
}
