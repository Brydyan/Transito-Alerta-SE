import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationEntity } from '../../entities/organization.entity';
import { GeoZoneEntity } from '../../entities/geo-zone.entity';
import { GeofencingModule } from '../geofencing/geofencing.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';

/**
 * OrganizationsModule (T3.2 design "Module Boundary") — imports nothing
 * from incidents, comments, assignments or realtime; only IncidentsModule
 * gains an import edge (for `findNotifiedFor` at create time, design D4/D7).
 *
 * T5.6 — additionally imports `GeofencingModule` (for `findZoneForPoint`
 * used by `notifiedFor`) and registers the geo-zones / organizations
 * repositories for the new tree/formData/notifiedFor endpoints.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OrganizationEntity, GeoZoneEntity]), GeofencingModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationsRepository],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
