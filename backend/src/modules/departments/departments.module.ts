import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationsModule } from '../organizations/organizations.module';
import { DepartmentEntity } from '../../entities/department.entity';
import { DepartmentsController } from './departments.controller';
import { DepartmentsRepository } from './departments.repository';
import { DepartmentsService } from './departments.service';

/**
 * DepartmentsModule (`back/2026-09-15-departments-module`).
 *
 * Wires the dept entity into TypeORM DI, instantiates the repo + service
 * + controller. Depends on `OrganizationsModule` for `OrganizationsRepository`
 * (used by `DepartmentsService.create` to validate the FK target before
 * INSERT — the OrganizationsModule was extended in Phase B to export it).
 */
@Module({
  imports: [TypeOrmModule.forFeature([DepartmentEntity]), OrganizationsModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsRepository, DepartmentsService],
  // Service is exported so future cross-module consumers (e.g.
  // `IncidentsModule` to surface the dept name on a detail view, or
  // `UsersModule` to populate a user's dept label) can pull it.
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
