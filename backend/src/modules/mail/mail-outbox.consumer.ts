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
  private sweeping = false;
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
      // BUSYGROUP: the group already exists (e.g., second test after reset).
      // SETID resets the cursor to the current end, so loop() sees only
      // NEW entries enqueued after this moment. Handles race where entries
      // arrive before XREADGROUP is actively BLOCK'ing.
      if ((err as Error).message?.includes('BUSYGROUP')) {
        await this.redis.xgroup('SETID', MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, '$');
      } else {
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
        // BLOCK timeout: 5s in prod, 1s in E2E (env configurable to catch
        // entries enqueued between XREADGROUP calls faster than 5s).
        const blockTimeoutMs = this.configService.get<number>('MAIL_XREADGROUP_BLOCK_MS') ?? 5000;
        const response = await this.redis.xreadgroup(
          'GROUP',
          MAIL_OUTBOX_CONSUMER_GROUP,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          blockTimeoutMs,
          'STREAMS',
          MAIL_OUTBOX_STREAM_KEY,
          '>',
        );
        if (response) {
          const entries = (response as unknown as [string, [string, string[]][]][]);
          const entryCount = entries[0]?.[1]?.length || 0;
          this.logger.debug(`[loop] XREADGROUP returned ${entryCount} entries`);
          await this.processResponse(entries);
        }
        // El caso `null` (timeout del BLOCK sin entradas nuevas) NO se loguea:
        // con BLOCK de 5s era una línea cada 5 segundos, para siempre, diciendo
        // que no pasó nada. Un log que siempre aparece no informa de nada.
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
      this.logger.debug(`[processResponse] Processing ${entries.length} entries from XREADGROUP`);
      for (const [entryId, fields] of entries) {
        this.logger.debug(`[processResponse] Calling processEntry for ${entryId}`);
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
      this.logger.error(`[processEntry] ${entryId} JSON parse failed, moving to dead:letter`);
      await this.deadLetter(entryId, fields);
      return;
    }

    try {
      this.logger.debug(`[processEntry] ${entryId} attempting deliver(to=${map.to})`);
      await this.mailService.deliver(map.to, map.subject, map.template as TemplateName, data);
      this.logger.debug(`[processEntry] ${entryId} SUCCESS, ACKing`);
      await this.redis.xack(MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, entryId);
    } catch (err) {
      if ((err as Error).message?.startsWith('Unknown mail template')) {
        this.logger.error(`[processEntry] ${entryId} unknown template, moving to dead:letter`);
        await this.deadLetter(entryId, fields);
        return;
      }
      // Transport failure (SMTP connect/send) — leave pending, the sweep
      // will XCLAIM and retry it.
      this.logger.error(`[processEntry] ${entryId} FAILED: ${(err as Error).message}`);
    }
  }

  private async deadLetter(entryId: string, fields: string[]): Promise<void> {
    this.logger.error(`[deadLetter] Entry ${entryId} moved to ${MAIL_DEAD_STREAM_KEY} (unretryable - data defect)`);
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
    // Early exit if already sweeping — prevents parallel sweep execution
    // (setInterval fires every 300ms but sweep may take >300ms).
    if (this.sweeping) return;

    this.sweeping = true;
    try {
      await this.sweepImpl();
    } finally {
      this.sweeping = false;
    }
  }

  private async sweepImpl(): Promise<void> {
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
      this.logger.debug(`[sweep] No pending entries (idle > ${mailConfig.claimIdleMs}ms)`);
      return;
    }

    this.logger.debug(`[sweep] Found ${pending.length} pending entries`);

    for (const [entryId, , , deliveryCount] of pending) {
      this.logger.debug(`[sweep] Entry ${entryId}: deliveryCount=${deliveryCount}, maxAttempts=${mailConfig.maxAttempts}`);
      if (deliveryCount >= mailConfig.maxAttempts) {
        this.logger.warn(`[sweep] Entry ${entryId} exhausted (deliveryCount ${deliveryCount} >= ${mailConfig.maxAttempts})`);
        try {
          await this.deadLetterById(entryId);
        } catch (err) {
          this.logger.error(`Sweep deadLetterById failed for ${entryId}: ${(err as Error).message}`);
        }
        continue;
      }

      try {
        this.logger.debug(`[sweep] Claiming ${entryId} (idle > ${mailConfig.claimIdleMs}ms) for retry`);
        const claimed = (await this.redis.xclaim(
          MAIL_OUTBOX_STREAM_KEY,
          MAIL_OUTBOX_CONSUMER_GROUP,
          this.consumerName,
          mailConfig.claimIdleMs,
          entryId,
        )) as unknown as XClaimEntry[];
        if (claimed && claimed.length > 0) {
          const [, fields] = claimed[0];
          this.logger.debug(`[sweep] Claimed successfully, calling processEntry`);
          await this.processEntry(entryId, fields);
        }
      } catch (err) {
        this.logger.error(`Sweep XCLAIM failed for ${entryId}: ${(err as Error).message}`);
      }
    }
  }

  private async deadLetterById(entryId: string): Promise<void> {
    this.logger.debug(`[deadLetterById] Processing ${entryId} for dead letter`);
    const range = (await this.redis.xrange(MAIL_OUTBOX_STREAM_KEY, entryId, entryId)) as unknown as XClaimEntry[];
    if (range.length === 0) {
      this.logger.warn(`[deadLetterById] ${entryId} not found in stream (already removed?)`);
      return;
    }

    const [, fields] = range[0];
    this.logger.error(`[deadLetterById] ${entryId} exhausted retries, moving to ${MAIL_DEAD_STREAM_KEY}`);

    // Move to dead letter (XADD)
    try {
      await this.redis.xadd(MAIL_DEAD_STREAM_KEY, '*', ...fields);
    } catch (err) {
      this.logger.error(`[deadLetterById] XADD failed for ${entryId}: ${(err as Error).message}`);
      return;
    }

    // Remove from origin stream (XDEL). This ensures XPENDING won't see it
    // again when it looks at which entries exist, even if XACK below fails.
    try {
      const delResult = await this.redis.xdel(MAIL_OUTBOX_STREAM_KEY, entryId);
      this.logger.debug(`[deadLetterById] XDEL returned ${delResult} for ${entryId}`);
    } catch (err) {
      this.logger.error(`[deadLetterById] XDEL failed for ${entryId}: ${(err as Error).message}`);
    }

    // XACK to clear from consumer group pending list. Entry is already in
    // dead letter, so best-effort (don't fail if this returns 0 or throws).
    try {
      const ackResult = await this.redis.xack(MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, entryId);
      this.logger.debug(`[deadLetterById] XACK returned ${ackResult} for ${entryId}`);
    } catch (err) {
      const errMsg = (err as Error).message;
      // Connection closed during shutdown: expected, don't fail.
      if (errMsg?.includes('Connection is closed')) {
        return;
      }
      // NOGROUP during shutdown: expected, don't re-throw.
      if (errMsg?.includes('NOGROUP')) {
        if (!this.running) return;
        throw err;
      }
      // Other errors: log but don't fail.
      this.logger.warn(`[deadLetterById] XACK threw for ${entryId}: ${errMsg}`);
    }
  }
}
