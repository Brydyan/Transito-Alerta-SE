import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationsModule } from '../organizations/organizations.module';
import { DepartmentEntity } from '../../entities/department.entity';
import { DepartmentsRepository } from './departments.repository';
import { DepartmentsService } from './departments.service';

/**
 * DepartmentsModule (`back/2026-09-15-departments-module`).
 *
 * Wires the dept entity into TypeORM DI, instantiates the repo + service.
 * The controller (Phase C) is registered later — for now only the
 * data-layer providers exist so the service + repo unit tests can run.
 *
 * Depends on `OrganizationsModule` for `OrganizationsRepository` (used by
 * `DepartmentsService.create` to validate the FK target before INSERT).
 */
@Module({
  imports: [TypeOrmModule.forFeature([DepartmentEntity]), OrganizationsModule],
  providers: [DepartmentsRepository, DepartmentsService],
  // Service is exported so future cross-module consumers (e.g.
  // `IncidentsModule` to surface the dept name on a detail view, or
  // `UsersModule` to populate a user's dept label) can pull it.
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
