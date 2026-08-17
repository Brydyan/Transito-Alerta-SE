import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { IncidentCategoriesController } from './incident-categories.controller';
import { IncidentCategoriesRepository } from './incident-categories.repository';
import { IncidentCategoriesService } from './incident-categories.service';

/**
 * IncidentCategoriesModule (T3.7) — design D1: TypeOrmModule.forFeature
 * backs the flat-CRUD `@InjectRepository`, IncidentCategoriesRepository is
 * a plain provider (raw `@InjectDataSource().query()`, no forFeature entry
 * needed).
 */
@Module({
  imports: [TypeOrmModule.forFeature([IncidentCategoryEntity])],
  controllers: [IncidentCategoriesController],
  providers: [IncidentCategoriesService, IncidentCategoriesRepository],
  exports: [IncidentCategoriesService],
})
export class IncidentCategoriesModule {}
