import { Module } from '@nestjs/common';

import { OrganizationsController } from './organizations.controller';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';

/**
 * OrganizationsModule (T3.2 design "Module Boundary") — imports nothing
 * from incidents, comments, assignments or realtime; only IncidentsModule
 * gains an import edge (for `findByZone` at create time, design D4).
 */
@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationsRepository],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
