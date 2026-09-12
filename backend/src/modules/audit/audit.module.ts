import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditEventEntity } from '../../entities/audit-event.entity';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * AUD (sc-327) — AuditModule.
 *
 * F6 (`2026-09-11-f6-audit-logs-export`) registra el
 * `AuditController` con los dos endpoints GET (`/` listado
 * paginado, `/export.csv` stream). El servicio es global y
 * se consume desde los módulos que necesiten registrar
 * acciones auditables (por ahora, `IncidentsModule` para la
 * revelación y la creación de incidencias).
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditEventEntity])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService, TypeOrmModule],
})
export class AuditModule {}
