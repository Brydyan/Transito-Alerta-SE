import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';
import Redis from 'ioredis';

import { CacheConfig } from '../../config/cache.config';

/**
 * RedisIoAdapter (design D5) — socket.io-redis-adapter for cross-instance
 * room broadcast. Without this, a Redis Streams consumer-group delivery
 * (RealtimeStreamsConsumer) reaches only the ONE instance that consumed
 * it; clients connected to other instances get nothing. Wired in main.ts
 * via `app.useWebSocketAdapter(new RedisIoAdapter(app))`.
 */
export class RedisIoAdapter extends IoAdapter {
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const config = this.app.get(ConfigService);
    const cacheConf = config.get<CacheConfig>('cache')!;

    this.pubClient = new Redis(cacheConf.redisUrl);
    this.subClient = this.pubClient.duplicate();

    const server = super.createIOServer(port, options);
    server.adapter(createAdapter(this.pubClient, this.subClient));
    return server;
  }

  /**
   * `IoAdapter.close()` only tears down the socket.io server itself — it
   * has no idea `createIOServer` above opened two extra ioredis
   * connections. Without overriding this, `pubClient`/`subClient` outlive
   * `app.close()`; once their target Redis is gone (container stopped,
   * pod recycled) each one retries forever under ioredis's default
   * infinite-retry strategy, throwing unhandled connection errors and
   * keeping the process alive. Discovered via the e2e harness (T4.1a):
   * plain HTTP-only unit/integration tests never exercise a real shutdown
   * against a real Redis, so this leak had no seam to be caught on before.
   *
   * The parameter type is derived from the base class rather than importing
   * `Server` from `socket.io` directly — this repo has two socket.io
   * versions in its dependency tree (a pnpm hoisting artifact of pinning
   * `@nestjs/platform-socket.io`/`@nestjs/websockets` to ^10.4.4 while
   * something else in the graph wants a newer one), and a fresh import can
   * silently resolve to the other copy, making `close()`'s signature
   * structurally incompatible with `IoAdapter.close()` at compile time.
   */
  async close(server: Parameters<IoAdapter['close']>[0]): Promise<void> {
    await super.close(server);
    this.pubClient?.disconnect();
    this.subClient?.disconnect();
  }
}
