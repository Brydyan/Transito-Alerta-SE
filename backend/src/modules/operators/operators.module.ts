import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentEntity } from '../../entities/incident.entity';
import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { OperatorsController } from './operators.controller';
import { OperatorLocationService } from './operator-location.service';
import { OperatorDashboardService } from './operator-dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([IncidentEntity, IncidentCategoryEntity])],
  controllers: [OperatorsController],
  providers: [OperatorLocationService, OperatorDashboardService],
})
export class OperatorsModule {}
