import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

import databaseConfig from '../config/database.config';
import authConfig from '../config/auth.config';
import cacheConfig from '../config/cache.config';
import { CacheConfig } from '../config/cache.config';

/**
 * CoreModule — Config, TypeORM, Redis cache, EventEmitter2.
 * Imported by AppModule; every feature module depends on it transitively
 * (design "Module Dependency DAG").
 */
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
  exports: [ConfigModule, TypeOrmModule, CacheModule, EventEmitterModule],
})
export class CoreModule {}
