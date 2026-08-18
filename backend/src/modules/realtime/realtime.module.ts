import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SessionsModule } from '../sessions/sessions.module';
import { EventsGateway } from './events.gateway';
import { RoomAuthorizer } from './room-authorizer.service';
import { RealtimeStreamsConsumer } from './streams.consumer';

/**
 * RealtimeModule (T2.5, CC4; T3.2 D11; T3.9 design §3) — design DAG:
 * `Realtime -> Auth (JWT verify only)`. Owns the WebSocket gateway + the
 * Streams consumer group that feeds it (design D5). `RoomAuthorizer`
 * issues its own indexed PK lookups through `DataSource` (already
 * provided globally by CoreModule/TypeOrmModule) rather than importing
 * IncidentsModule or OrganizationsModule — deliberately zero domain-module
 * edge, zero cycle risk (design "Module Boundary").
 *
 * Imports `SessionsModule` directly (not re-exported through `AuthModule`)
 * for `RevocationCache` — `EventsGateway.handleConnection` applies the
 * same denylist check as `JwtStrategy.validate` (T3.9 design §3) so a
 * revoked session cannot hold an open socket.
 */
@Module({
  imports: [AuthModule, SessionsModule],
  providers: [EventsGateway, RealtimeStreamsConsumer, RoomAuthorizer],
  exports: [EventsGateway],
})
export class RealtimeModule {}
