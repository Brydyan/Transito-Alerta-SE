import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssignmentEntity } from '../../entities/assignment.entity';
import { IncidentsModule } from '../incidents/incidents.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

/**
 * AssignmentsModule (design DAG: `Assignments -> Incidents, Users,
 * Permissions`). Imports IncidentsModule (T3.2 D3) for
 * `IncidentsRepository` — resolving the parent incident's visibility
 * before returning its assignments.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AssignmentEntity]), IncidentsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
