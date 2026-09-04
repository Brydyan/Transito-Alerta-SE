import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IncidentEntity } from '../../entities/incident.entity';
import { StatusHistoryEntity } from '../../entities/status-history.entity';
import { StatusHistoryController } from './status-history.controller';
import { StatusHistoryRepository } from './status-history.repository';
import { StatusHistoryService } from './status-history.service';

/**
 * StatusHistoryModule (design D7 — "zero import edges" toward Incidents'
 * behaviour). `IncidentEntity` is imported flat, for the parent-existence
 * 404 check only; `STATUS_HISTORY_EVENTS_BLOCKING_CLIENT` is a `@Global()`
 * CoreModule provider, injected by token with no module import. No
 * exports: nothing in the system depends on this module.
 */
@Module({
  imports: [TypeOrmModule.forFeature([StatusHistoryEntity, IncidentEntity])],
  controllers: [StatusHistoryController],
  providers: [StatusHistoryService, StatusHistoryRepository],
})
export class StatusHistoryModule {}
