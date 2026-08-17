import { Module } from '@nestjs/common';

import { GeofencingModule } from '../geofencing/geofencing.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

/**
 * IncidentsModule (design DAG: `Incidents -> Users, IncidentCategories,
 * Geofencing, Locations, Organizations`). Users/IncidentCategories/
 * Locations land in later phases; Geofencing is wired since T2.1.
 * OrganizationsModule (T3.2 design D4) is imported for
 * `OrganizationsService.findByZone` at create time — the only edge in the
 * module boundary graph; OrganizationsModule imports nothing back.
 */
@Module({
  imports: [GeofencingModule, OrganizationsModule],
  controllers: [IncidentsController],
  providers: [IncidentsRepository, IncidentsService],
  // IncidentsRepository is exported too (T3.2 D3) — Comments/Assignments
  // resolve the PARENT incident under the caller's scope before touching
  // their own rows, without importing the whole IncidentsService surface.
  exports: [IncidentsService, IncidentsRepository],
})
export class IncidentsModule {}
