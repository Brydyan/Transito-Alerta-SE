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
}
