import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GeofencingModule } from '../geofencing/geofencing.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OrganizationEntity } from '../../entities/organization.entity';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';
import { IncidentWorkflowController } from './incident-workflow.controller';
import { IncidentWorkflowService } from './incident-workflow.service';

/**
 * IncidentsModule (design DAG: `Incidents -> Users, IncidentCategories,
 * Geofencing, Locations, Organizations`). Users/IncidentCategories/
 * Locations land in later phases; Geofencing is wired since T2.1.
 * OrganizationsModule (T3.2 design D4) is imported for
 * `OrganizationsService.findByZone` at create time — the only edge in the
 * module boundary graph; OrganizationsModule imports nothing back.
 *
 * T5.1 — registers IncidentWorkflowController + IncidentWorkflowService
 * for the operator claim/release lifecycle. The workflow service needs the
 * OrganizationEntity repository (for max_active_claims), so it goes through
 * TypeOrmModule.forFeature.
 */
@Module({
  imports: [GeofencingModule, OrganizationsModule, TypeOrmModule.forFeature([OrganizationEntity])],
  controllers: [IncidentWorkflowController, IncidentsController],
  providers: [IncidentsRepository, IncidentsService, IncidentWorkflowService],
  // IncidentsRepository is exported too (T3.2 D3) — Comments/Assignments
  // resolve the PARENT incident under the caller's scope before touching
  // their own rows, without importing the whole IncidentsService surface.
  exports: [IncidentsService, IncidentsRepository],
})
export class IncidentsModule {}
