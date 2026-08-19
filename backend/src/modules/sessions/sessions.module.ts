import { Module } from '@nestjs/common';

import { GraceBuffer } from './grace-buffer';
import { RevocationCache } from './revocation-cache';
import { SessionsBootWarmService } from './sessions-boot-warm.service';
import { SessionsController } from './sessions.controller';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

/**
 * SessionsModule (T3.9 design §8) — a LEAF module: `DataSource` (via
 * `@InjectDataSource`) and `SESSION_REDIS_CLIENT` are both `@Global()`
 * `CoreModule` providers, injected by token with zero `imports` here —
 * same pattern as `StatusHistoryModule`/`RoomAuthorizer`. Imports NO
 * feature module, so `AuthModule -> SessionsModule` and
 * `UsersModule -> SessionsModule` can never cycle back.
 *
 * Exports `SessionsRepository`, `RevocationCache`, `GraceBuffer` — NOT
 * `SessionsService` (design §8: `AuthModule` depends only on the
 * repository + cache classes, never the authorization-layer service).
 */
@Module({
  controllers: [SessionsController],
  providers: [
    SessionsRepository,
    SessionsService,
    RevocationCache,
    GraceBuffer,
    SessionsBootWarmService,
  ],
  exports: [SessionsRepository, RevocationCache, GraceBuffer],
})
export class SessionsModule {}
