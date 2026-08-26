import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IncidentStatus } from '../../entities/incident.entity';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { StatsQueryDto } from './dto/stats-query.dto';
import { WeeklyStatsQueryDto } from './dto/weekly-stats-query.dto';
import { FeedQueryDto } from './dto/feed-query.dto';
import { ExportQueryDto } from './dto/export-query.dto';
import { ExportFormat } from './incident-export.service';
import { IncidentRow } from './incidents.repository';
import { IncidentsService } from './incidents.service';
import { IncidentAnalyticsService } from './incident-analytics.service';
import { IncidentFeedService } from './incident-feed.service';
import { IncidentExportService } from './incident-export.service';
import { FeedRecoveryService } from './feed-recovery.service';

/**
 * IncidentsController (R2) — calibration slice. Anonymous devices hold
 * "CREATE incidents"/"READ incidents" on the anonymous permission ceiling
 * (auth.config.ts); status transitions require "UPDATE incidents", which
 * anonymous does NOT hold.
 *
 * Route order matters: literal routes (stats, weekly-stats, feed, export)
 * MUST be declared before the `:id` wildcard to avoid shadowing.
 */
@Controller('incidents')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly analyticsService: IncidentAnalyticsService,
    private readonly feedService: IncidentFeedService,
    private readonly exportService: IncidentExportService,
    private readonly feedRecoveryService: FeedRecoveryService,
  ) {}

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

  // ---- T5.2 analytics routes — declared BEFORE :id to avoid shadowing ---

  @Get('stats')
  @RequirePermission('READ', 'dashboard')
  async getStats(@Query() query: StatsQueryDto, @Req() req: AuthenticatedRequest) {
    return this.analyticsService.getStats(query, req.user!);
  }

  @Get('weekly-stats')
  @RequirePermission('READ', 'dashboard')
  async getWeeklyStats(@Query() query: WeeklyStatsQueryDto, @Req() req: AuthenticatedRequest) {
    return this.analyticsService.getWeeklyStats(query, req.user!);
  }

  @Get('feed')
  @RequirePermission('READ')
  async getFeed(@Query() query: FeedQueryDto, @Req() req: AuthenticatedRequest) {
    const user = req.user!;
    if (this.feedService.isStaffRole(user)) {
      return this.feedService.getStaffFeed(query, user);
    }
    return this.feedService.getCitizenFeed(query);
  }

  @Get(['export', 'exportar'])
  @RequirePermission('READ', 'dashboard')
  async exportCsv(
    @Query() query: ExportQueryDto,
    @Query('format') format: ExportFormat = 'csv',
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const user = req.user!;

    const CAP = 5000;
    const total = await this.exportService.countFiltered(query, user);
    if (total > CAP) {
      res.setHeader('X-Report-Truncated', 'true');
      res.setHeader('X-Report-Original-Total', String(total));
      res.setHeader('X-Report-Exported', String(CAP));
    }

    const { stream, contentType, filename } = await this.exportService.createExportStream(query, user, CAP, format);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  }

  // ---- T6.8.A4: Status catalog — no auth required (public) ----------------

  @Get('statuses')
  getStatuses() {
    return this.incidentsService.getStatuses();
  }

  // ---- T6.7.C3: Admin — manual feed rebuild --------------------------------

  @Post('admin/feed/rebuild')
  @HttpCode(HttpStatus.ACCEPTED)
  async rebuildFeed(@Req() req: AuthenticatedRequest): Promise<{ rebuilt: number }> {
    // Admin-only: only master role may trigger manual feed rebuild
    if (req.user!.roleName !== 'master') {
      throw new ForbiddenException('Only master may trigger feed rebuild');
    }
    const rebuilt = await this.feedRecoveryService.rebuildFeed();
    return { rebuilt };
  }

  // ---- existing routes (wildcard :id must come after literal routes) -----

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

  // ---- T5.6 PATCH/DELETE — declared AFTER `:id/status` to keep the
  // status-specific route winning the matching race for the literal
  // segment "status".

  @Patch(':id')
  @RequirePermission('UPDATE')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateIncidentDto,
  ): Promise<IncidentRow> {
    return this.incidentsService.update(id, {
      title: dto.title,
      description: dto.description,
      categoryId: dto.category_id,
    });
  }

  @Delete(':id')
  @RequirePermission('DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.incidentsService.softDelete(id);
  }
}
