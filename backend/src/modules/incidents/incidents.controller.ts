import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IncidentStatus } from '../../entities/incident.entity';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { IncidentRow } from './incidents.repository';
import { IncidentsService } from './incidents.service';

/**
 * IncidentsController (R2) — calibration slice. Anonymous devices hold
 * "CREATE incidents"/"READ incidents" on the anonymous permission ceiling
 * (auth.config.ts); status transitions require "UPDATE incidents", which
 * anonymous does NOT hold.
 */
@Controller('incidents')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @RequirePermission('CREATE')
  create(
    @Body() dto: CreateIncidentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<IncidentRow> {
    return this.incidentsService.create(dto, req.user!.userId);
  }

  @Get()
  @RequirePermission('READ')
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('zone_id') zoneId?: string,
    @Query('status') status?: IncidentStatus,
  ): Promise<IncidentRow[]> {
    return this.incidentsService.findAll(zoneId, status, req.user!.scope);
  }

  @Get(':id')
  @RequirePermission('READ')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<IncidentRow> {
    return this.incidentsService.findOne(id, req.user!.scope);
  }

  @Patch(':id/status')
  @RequirePermission('UPDATE')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateIncidentStatusDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<IncidentRow> {
    return this.incidentsService.updateStatus(id, dto.status, req.user!.userId, req.user!.scope);
  }
}
