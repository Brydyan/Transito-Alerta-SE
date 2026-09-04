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
 * 404 check only. No exports: nothing in the system depends on this module.
 *
 * Desde sc-315 este módulo es sólo LECTURA. La escritura del historial vive
 * en `IncidentWorkflowService.changeStatus()`, en la misma transacción que el
 * cambio de estado. El consumidor que lo escribía desde el stream —y su
 * conexión Redis bloqueante dedicada— se retiraron: convivían con esa
 * escritura y producían dos filas por transición.
 */
@Module({
  imports: [TypeOrmModule.forFeature([StatusHistoryEntity, IncidentEntity])],
  controllers: [StatusHistoryController],
  providers: [StatusHistoryService, StatusHistoryRepository],
})
export class StatusHistoryModule {}
