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

/**
 * DI token for the raw ioredis client — used where cache-manager's Cache
 * interface is insufficient (SADD/SMEMBERS/DEL for cache tag-sets, XADD for
 * Streams, the socket.io Redis adapter). Registered isGlobal so any feature
 * module can @Inject(REDIS_CLIENT) without importing CoreModule directly.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

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
      load: [databaseConfig, authConfig, cacheConfig],
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
          url: cacheConf.redisUrl,
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
        return new Redis(cacheConf.redisUrl, { lazyConnect: true });
      },
    },
  ],
  exports: [ConfigModule, TypeOrmModule, CacheModule, EventEmitterModule, REDIS_CLIENT],
})
export class CoreModule {}
