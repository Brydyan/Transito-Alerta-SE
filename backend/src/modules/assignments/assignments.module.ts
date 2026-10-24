import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssignmentEntity } from './entities/assignment.entity';
import { IncidentsModule } from '../incidents/incidents.module';
// 2026-10-16 — AUD (sc-327) — `AuditModule` is imported solely to
// register the `AuditService` provider that `AssignmentsService`
// injects (constructor param). The symbol is consumed through Nest's
// module-metadata `imports` array, not a direct code reference; the
// `eslint-disable-next-line no-unused-vars` accommodates the tooling.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AuditModule } from '../audit/audit.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

/**
 * AssignmentsModule (design DAG: `Assignments -> Incidents, Users,
 * Permissions`). Imports IncidentsModule (T3.2 D3) for
 * `IncidentsRepository` — resolving the parent incident's visibility
 * before returning its assignments.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AssignmentEntity]), IncidentsModule, AuditModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
