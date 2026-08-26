import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { GeoZoneLevel } from '../../entities/geo-zone.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateGeoZoneDto } from './dto/create-geo-zone.dto';
import { UpdateGeoZoneDto } from './dto/update-geo-zone.dto';
import { GeoZoneDetailRow, GeoZoneNode } from './geo-zones.repository';
import { GeoZonesService, ListResult } from './geo-zones.service';

/**
 * GeoZonesController (T3.8) — `@Controller('geo-zones')`, never
 * `'api/geo-zones'` (setGlobalPrefix('api') already supplies it). `GET
 * /tree` MUST be declared before `GET /:id` — Nest matches routes in
 * declaration order and `:id` would otherwise swallow the literal `tree`
 * segment (design, controller section). No `{data}` envelope (global
 * SnakeCaseResponseInterceptor) — entities/arrays returned directly;
 * `list()` returns `{items, total}`.
 */
@Controller('geo-zones')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class GeoZonesController {
  constructor(private readonly geoZonesService: GeoZonesService) {}

  @Get('tree')
  @RequirePermission('READ')
  getTree(): Promise<GeoZoneNode[]> {
    return this.geoZonesService.getTree();
  }

  @Get()
  @RequirePermission('READ')
  list(
    @Query('search') search?: string,
    @Query('parent_id') parentId?: string,
    @Query('level') level?: GeoZoneLevel,
    @Query('include_inactive') includeInactive?: string,
    @Query('code') code?: string,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ): Promise<ListResult> {
    return this.geoZonesService.list({
      search,
      parentId: parentId === 'null' ? null : parentId,
      level,
      includeInactive: includeInactive === 'true',
      code,
      page: page ? parseInt(page, 10) : undefined,
      perPage: perPage ? parseInt(perPage, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('READ')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GeoZoneDetailRow> {
    return this.geoZonesService.findById(id);
  }

  @Post()
  @RequirePermission('CREATE')
  create(@Body() dto: CreateGeoZoneDto): Promise<GeoZoneDetailRow> {
    return this.geoZonesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGeoZoneDto,
  ): Promise<GeoZoneDetailRow> {
    return this.geoZonesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.geoZonesService.delete(id);
  }
}
