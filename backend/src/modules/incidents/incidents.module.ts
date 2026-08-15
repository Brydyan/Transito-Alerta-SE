import { Module } from '@nestjs/common';

import { GeofencingModule } from '../geofencing/geofencing.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

/**
 * IncidentsModule (design DAG: `Incidents -> Users, IncidentCategories,
 * Geofencing, Locations`). Users/IncidentCategories/Locations land in later
 * phases; Geofencing is wired now (T2.1 depends on T2.0).
 */
@Module({
  imports: [GeofencingModule],
  controllers: [IncidentsController],
  providers: [IncidentsRepository, IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
