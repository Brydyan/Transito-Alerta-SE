import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import Redis from 'ioredis';

import databaseConfig from '../config/database.config';
import authConfig from '../config/auth.config';
import cacheConfig from '../config/cache.config';
import { CacheConfig } from '../config/cache.config';
import mailConfig from '../config/mail.config';

/**
 * DI token for the raw ioredis client — used where cache-manager's Cache
 * interface is insufficient (SADD/SMEMBERS/DEL for cache tag-sets, XADD for
 * Streams, the socket.io Redis adapter). Registered isGlobal so any feature
 * module can @Inject(REDIS_CLIENT) without importing CoreModule directly.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * A SECOND connection, dedicated to blocking reads.
 *
 * ioredis serialises commands on a connection, and `XREADGROUP ... BLOCK`
 * holds one for up to its timeout. Sharing REDIS_CLIENT between the Streams
 * consumer and the producers put every `XADD` and every cache tag operation
 * in a queue behind a read that blocks for seconds — so an incident write
 * waited on the realtime loop. That defeats the point of the system: an
 * operator is supposed to see a report the instant it is filed.
 *
 * A blocking consumer always needs its own connection.
 */
export const REDIS_BLOCKING_CLIENT = 'REDIS_BLOCKING_CLIENT';

/**
 * Dedicated blocking connection for MailOutboxConsumer (design D8/D13) —
 * XREADGROUP on `mail:outbox`. Same reasoning as REDIS_BLOCKING_CLIENT: a
 * blocking consumer must never share a connection with a producer, and two
 * *different* blocking consumers must not share one either (a slow SMTP
 * delivery loop pausing between reads must never stall event ingestion on
 * the other stream, and vice versa).
 */
export const MAIL_BLOCKING_CLIENT = 'MAIL_BLOCKING_CLIENT';

/**
 * Dedicated blocking connection for IncidentMailListener (design D8/D13) —
 * XREADGROUP on `incidents:events`, consumer group `mail`. Separate both
 * from REDIS_BLOCKING_CLIENT (RealtimeStreamsConsumer's own group on the
 * same stream) and from MAIL_BLOCKING_CLIENT (delivery backpressure must
 * never block event consumption — D8).
 */
export const MAIL_EVENTS_BLOCKING_CLIENT = 'MAIL_EVENTS_BLOCKING_CLIENT';

/**
 * CoreModule — Config, TypeORM, Redis cache, EventEmitter2.
 * Imported by AppModule; every feature module depends on it transitively
 * (design "Module Dependency DAG").
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, authConfig, cacheConfig, mailConfig],
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get('database')!,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const cacheConf = config.get<CacheConfig>('cache')!;
        const store = await redisStore({
          url: cacheConf.cacheUrl,
          ttl: cacheConf.ttlSeconds * 1000,
        });
        return { store: () => store };
      },
    }),
    EventEmitterModule.forRoot(),
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const cacheConf = config.get<CacheConfig>('cache')!;
        // Streams, tag-sets and the socket.io adapter share DB 0; the
        // cache-manager store above is isolated on its own database so a
        // cache flush can never wipe Streams or session state.
        return new Redis(cacheConf.streamsUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          retryStrategy: (times) => Math.min(times * 200, 5000),
        });
      },
    },
    {
      provide: REDIS_BLOCKING_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const cacheConf = config.get<CacheConfig>('cache')!;
        return new Redis(cacheConf.streamsUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          retryStrategy: (times) => Math.min(times * 200, 5000),
        });
      },
    },
    {
      provide: MAIL_BLOCKING_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const cacheConf = config.get<CacheConfig>('cache')!;
        return new Redis(cacheConf.streamsUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          retryStrategy: (times) => Math.min(times * 200, 5000),
        });
      },
    },
    {
      provide: MAIL_EVENTS_BLOCKING_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const cacheConf = config.get<CacheConfig>('cache')!;
        return new Redis(cacheConf.streamsUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          retryStrategy: (times) => Math.min(times * 200, 5000),
        });
      },
    },
  ],
  exports: [
    ConfigModule,
    TypeOrmModule,
    CacheModule,
    EventEmitterModule,
    REDIS_CLIENT,
    REDIS_BLOCKING_CLIENT,
    MAIL_BLOCKING_CLIENT,
    MAIL_EVENTS_BLOCKING_CLIENT,
  ],
})
export class CoreModule {}
