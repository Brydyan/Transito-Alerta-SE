import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EventsGateway } from './events.gateway';
import { RealtimeStreamsConsumer } from './streams.consumer';

/**
 * RealtimeModule (T2.5, CC4) — design DAG: `Realtime -> Auth (JWT verify
 * only)`. Owns the WebSocket gateway + the Streams consumer group that
 * feeds it (design D5).
 */
@Module({
  imports: [AuthModule],
  providers: [EventsGateway, RealtimeStreamsConsumer],
  exports: [EventsGateway],
})
export class RealtimeModule {}
