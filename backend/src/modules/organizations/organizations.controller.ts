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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationRow } from './organizations.repository';
import { ListResult, OrganizationsService } from './organizations.service';

/**
 * OrganizationsController (T3.2 design D8) — mirrors GeoZonesController's
 * shape. No `{data}` envelope (global SnakeCaseResponseInterceptor) —
 * entities/arrays returned directly; `list()` returns `{items, total}`.
 * This module needs no `scope` parameter itself (organizations are not a
 * scoped resource under D3's table).
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @RequirePermission('READ')
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ): Promise<ListResult> {
    return this.organizationsService.list({
      search,
      page: page ? parseInt(page, 10) : undefined,
      perPage: perPage ? parseInt(perPage, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('READ')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OrganizationRow> {
    return this.organizationsService.findById(id);
  }

  @Post()
  @RequirePermission('CREATE')
  create(@Body() dto: CreateOrganizationDto): Promise<OrganizationRow> {
    return this.organizationsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationRow> {
    return this.organizationsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.organizationsService.delete(id);
  }
}
