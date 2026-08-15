import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../core/core.module';
import { INCIDENTS_STREAM_KEY } from '../incidents/incidents.service';
import { EventsGateway } from './events.gateway';
import { decodeStreamEntry } from './stream-event.util';

const CONSUMER_GROUP = 'realtime';

/** Pause after a failed read so a Redis outage cannot spin the loop hot. */
export const RETRY_BACKOFF_MS = 1000;

/**
 * RealtimeStreamsConsumer (design D5) — Redis Streams consumer group over
 * `incidents:events`. Consumer-group semantics deliver each entry to
 * exactly ONE instance in the group (preventing duplicate broadcasts
 * across horizontally-scaled API instances); the socket.io Redis adapter
 * (main.ts) then fans that single delivery out to every instance's
 * connected clients. Dropping either half breaks correctness (D5).
 */
@Injectable()
export class RealtimeStreamsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeStreamsConsumer.name);
  private readonly consumerName = `consumer-${process.pid}-${Math.random().toString(36).slice(2)}`;
  private running = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly gateway: EventsGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', INCIDENTS_STREAM_KEY, CONSUMER_GROUP, '$', 'MKSTREAM');
    } catch (err) {
      // BUSYGROUP: the group already exists — expected on every restart.
      if (!(err as Error).message?.includes('BUSYGROUP')) {
        this.logger.error(`Failed to create consumer group: ${(err as Error).message}`);
      }
    }
    this.running = true;
    void this.loop();
  }

  onModuleDestroy(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const response = await this.redis.xreadgroup(
          'GROUP',
          CONSUMER_GROUP,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          5000,
          'STREAMS',
          INCIDENTS_STREAM_KEY,
          '>',
        );
        if (response) {
          this.processResponse(response as unknown as [string, [string, string[]][]][]);
        }
      } catch (err) {
        // A rejection during shutdown is the connection closing under a
        // blocked XREADGROUP, not a fault — logging it as an error makes
        // every deploy look like an incident.
        if (!this.running) {
          break;
        }

        this.logger.error(`Streams consumer loop error: ${(err as Error).message}`);

        // Back off before retrying. Without this a Redis outage spins the
        // loop hot: XREADGROUP rejects immediately, the catch retries
        // immediately, and the process burns CPU while flooding the logs.
        await this.sleep(RETRY_BACKOFF_MS);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Extracted for testability — no live Redis connection required. */
  processResponse(response: [string, [string, string[]][]][]): void {
    for (const [, entries] of response) {
      for (const [entryId, fields] of entries) {
        const event = decodeStreamEntry(fields);
        if (event) {
          this.gateway.broadcast(event.type, event.data);
        }
        void this.redis.xack(INCIDENTS_STREAM_KEY, CONSUMER_GROUP, entryId);
      }
    }
  }
}
