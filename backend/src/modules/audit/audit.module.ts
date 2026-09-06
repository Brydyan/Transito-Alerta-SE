import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditEventEntity } from '../../entities/audit-event.entity';
import { AuditService } from './audit.service';

/**
 * AUD (sc-327) — AuditModule. Importa `AuditEventEntity` para
 * exponer el repositorio vía `TypeOrmModule.forFeature`. El
 * servicio es global y se consume desde los módulos que
 * necesiten registrar acciones auditables (por ahora,
 * `IncidentsModule` para la revelación y la creación de
 * incidencias).
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditEventEntity])],
  providers: [AuditService],
  exports: [AuditService, TypeOrmModule],
})
export class AuditModule {}
