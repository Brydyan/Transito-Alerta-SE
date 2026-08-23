import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { MapController } from './map.controller';
import { MapSupportService } from './map-support.service';

/**
 * T5.4 — MapModule. A thin module that owns the read-only map-catalog
 * endpoints. Imports `TypeOrmModule.forFeature([IncidentCategoryEntity])`
 * directly (D1) instead of pulling the full IncidentCategoriesModule —
 * keeps the dependency surface minimal (no controller / no service
 * import) and avoids any chance of circular dependency later.
 */
@Module({
  imports: [TypeOrmModule.forFeature([IncidentCategoryEntity])],
  controllers: [MapController],
  providers: [MapSupportService],
})
export class MapModule {}
