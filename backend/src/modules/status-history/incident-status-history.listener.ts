import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { STATUS_HISTORY_EVENTS_BLOCKING_CLIENT } from '../../core/core.module';
import { INCIDENTS_STREAM_KEY } from '../incidents/incidents.service';
import { decodeStreamEntry } from '../realtime/stream-event.util';
import { StatusHistoryRepository } from './status-history.repository';

export const STATUS_HISTORY_CONSUMER_GROUP = 'status-history';

/** Pause after a failed read so a Redis outage cannot spin the loop hot (mirrors incident-mail.listener.ts). */
export const RETRY_BACKOFF_MS = 1000;

type XPendingRow = [string, string, number, number];
type XClaimEntry = [string, string[]];

/** PG error codes that are permanent — retrying can never make them succeed (D3). */
const PERMANENT_PG_ERROR_CODES = new Set([
  '23503', // foreign_key_violation
  '23514', // check_violation
  '23502', // not_null_violation
  '22P02', // invalid_text_representation (bad uuid)
]);

/**
 * IncidentStatusHistoryListener (design D1-D4) — its own consumer group
 * (`status-history`) on `incidents:events`, structurally mirroring
 * `IncidentMailListener` (group CREATE + MKSTREAM at `onModuleInit`,
 * `while(running)` + BLOCK, per-entry decode/route) but with Mail's
 * *outbox* consumer's XPENDING/XCLAIM sweep grafted on, because this
 * listener cannot always-XACK (D3) — a failed insert must survive a
 * restart.
 *
 * `sweep()`, `processResponse()`, `processEntry()` are public and
 * unguarded (D4) — a unit test constructs this class with a mocked
 * ioredis object and calls them directly, without `onModuleInit`, no
 * timers, no `running = true` prelude.
 */
@Injectable()
export class IncidentStatusHistoryListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentStatusHistoryListener.name);
  private readonly consumerName = `status-history-consumer-${process.pid}-${Math.random().toString(36).slice(2)}`;
  private running = false;
  private sweeping = false;
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(STATUS_HISTORY_EVENTS_BLOCKING_CLIENT) private readonly redis: Redis,
    private readonly statusHistoryRepository: StatusHistoryRepository,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, '$', 'MKSTREAM');
    } catch (err) {
      if (!(err as Error).message?.includes('BUSYGROUP')) {
        this.logger.error(`Failed to create status-history consumer group: ${(err as Error).message}`);
      }
    }

    this.running = true;
    void this.loop();

    const sweepIntervalMs = this.configService.get<number>('STATUS_HISTORY_SWEEP_INTERVAL_MS') ?? 10_000;
    this.sweepTimer = setInterval(() => {
      if (this.running) void this.sweep();
    }, sweepIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false; // loop() exits at its next iteration
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
    await this.redis.quit().catch(() => undefined);
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const blockMs = this.configService.get<number>('STATUS_HISTORY_XREADGROUP_BLOCK_MS') ?? 5000;
        const response = await this.redis.xreadgroup(
          'GROUP',
          STATUS_HISTORY_CONSUMER_GROUP,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          blockMs,
          'STREAMS',
          INCIDENTS_STREAM_KEY,
          '>',
        );
        if (response) {
          await this.processResponse(response as unknown as [string, [string, string[]][]][]);
        }
      } catch (err) {
        if (!this.running) {
          break;
        }
        this.logger.error(`Status-history listener loop error: ${(err as Error).message}`);
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
   * The D3 decision table, in code. `entryId` doubles as `event_id` — the
   * idempotency key is the Redis stream entry id, never something read
   * from the payload.
   */
  async processEntry(entryId: string, fields: string[]): Promise<void> {
    const event = decodeStreamEntry(fields);
    if (!event) {
      this.logger.warn(`Undecodable status-history entry ${entryId}, ACKing (never retryable)`);
      await this.ack(entryId);
      return;
    }

    if (event.type !== 'incident.status_changed') {
      await this.ack(entryId);
      return;
    }

    const data = event.data;
    const incidentId = data.id as string | undefined;
    const previousStatus = data.previous_status as string | undefined;
    const newStatus = data.status as string | undefined;

    if (!incidentId || !previousStatus || !newStatus || previousStatus === newStatus) {
      this.logger.error(
        `Bad incident.status_changed payload on entry ${entryId}: ${JSON.stringify(data)}, ACKing (retry cannot fix a payload)`,
      );
      await this.ack(entryId);
      return;
    }

    try {
      const rows = await this.statusHistoryRepository.insert({
        incidentId,
        changedByUserId: (data.actor_id as string | undefined) ?? null,
        previousStatus,
        newStatus,
        eventId: entryId,
      });
      // rows.length === 0 means ON CONFLICT (event_id) DO NOTHING fired —
      // an expected idempotent-replay outcome, not a failure. Either way
      // (inserted or already recorded) the entry is ACKed.
      void rows;
      await this.ack(entryId);
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      if (code && PERMANENT_PG_ERROR_CODES.has(code)) {
        this.logger.error(
          `Permanent DB error (${code}) inserting status-history for entry ${entryId}: ${(err as Error).message}, ACKing`,
        );
        await this.ack(entryId);
        return;
      }
      // Transient failure (connection, timeout, serialization) — leave
      // PENDING for redelivery / the sweep to reclaim. No ACK.
      this.logger.error(`Transient DB error inserting status-history for entry ${entryId}: ${(err as Error).message}`);
    }
  }

  private async ack(entryId: string): Promise<void> {
    await this.redis.xack(INCIDENTS_STREAM_KEY, STATUS_HISTORY_CONSUMER_GROUP, entryId);
  }

  /**
   * XPENDING (extended) -> XCLAIM sweep (D2). Re-entrancy guarded by
   * `sweeping`, kept separate from the `running` lifecycle flag so this
   * method stays callable directly in a unit test with no
   * `onModuleInit` prelude (D4).
   */
  async sweep(): Promise<void> {
    if (this.sweeping) {
      return;
    }
    this.sweeping = true;
    try {
      await this.sweepImpl();
    } finally {
      this.sweeping = false;
    }
  }

  private async sweepImpl(): Promise<void> {
    const claimIdleMs = this.configService.get<number>('STATUS_HISTORY_CLAIM_IDLE_MS') ?? 30_000;
    const maxAttempts = this.configService.get<number>('STATUS_HISTORY_MAX_ATTEMPTS') ?? 5;

    let pending: XPendingRow[];
    try {
      pending = (await this.redis.xpending(
        INCIDENTS_STREAM_KEY,
        STATUS_HISTORY_CONSUMER_GROUP,
        'IDLE',
        claimIdleMs,
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

    if (!pending || pending.length === 0) {
      return;
    }

    for (const [entryId, , , deliveryCount] of pending) {
      if (deliveryCount >= maxAttempts) {
        this.logger.error(
          `audit row permanently lost: entry ${entryId} exhausted ${deliveryCount} delivery attempts, ACKing`,
        );
        await this.ack(entryId);
        continue;
      }

      try {
        const claimed = (await this.redis.xclaim(
          INCIDENTS_STREAM_KEY,
          STATUS_HISTORY_CONSUMER_GROUP,
          this.consumerName,
          claimIdleMs,
          entryId,
        )) as unknown as XClaimEntry[];
        if (claimed && claimed.length > 0) {
          const [, fields] = claimed[0];
          await this.processEntry(entryId, fields);
        }
      } catch (err) {
        if (this.running) {
          this.logger.error(`Sweep XCLAIM failed for ${entryId}: ${(err as Error).message}`);
        }
      }
    }
  }
}
