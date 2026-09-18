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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { MenuOptionEndpointEntity } from './entities/menu-option-endpoint.entity';
import { ApiEndpointEntity } from './entities/api-endpoint.entity';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';
import { SetRoleAccessDto } from './dto/set-role-access.dto';
import { AssignEndpointsDto } from './dto/assign-endpoints.dto';
import { MenuOptionsService, RoleMatrix, PaginatedResult } from './menu-options.service';

/**
 * MenuOptionsController (F5.5.4) — admin CRUD for dynamic menu options.
 *
 * Every endpoint uses PermissionGuard with @RequirePermission on the
 * 'menu-options' resource. Without the required permission ⇒ 403.
 *
 * Route: /api/menu-options (NestJS global prefix /api).
 */
@Controller('menu-options')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MenuOptionsController {
  constructor(private readonly menuOptionsService: MenuOptionsService) {}

  // ── CRUD ───────────────────────────────────────────────────────────────

  @Get()
  @RequirePermission('READ', 'menu-options')
  findAll(): Promise<MenuOptionEntity[]> {
    return this.menuOptionsService.findAll();
  }

  @Get('endpoints')
  @RequirePermission('READ', 'menu-options')
  getEndpointCatalog(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('route') route?: string,
    @Query('method') method?: string,
    @Query('description') description?: string,
    @Query('module') module?: string,
  ): Promise<PaginatedResult<ApiEndpointEntity>> {
    return this.menuOptionsService.getEndpointCatalog({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      route,
      method,
      description,
      module,
    });
  }

  @Get(':id')
  @RequirePermission('READ', 'menu-options')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<MenuOptionEntity> {
    return this.menuOptionsService.findOne(id);
  }

  @Post()
  @RequirePermission('CREATE', 'menu-options')
  create(@Body() dto: CreateMenuOptionDto): Promise<MenuOptionEntity> {
    return this.menuOptionsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('UPDATE', 'menu-options')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMenuOptionDto,
  ): Promise<MenuOptionEntity> {
    return this.menuOptionsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('DELETE', 'menu-options')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.menuOptionsService.delete(id);
  }

  // ── Role matrix (F5.5.5) ─────────────────────────────────────────────

  @Get(':id/roles')
  @RequirePermission('READ', 'menu-options')
  getRoleMatrix(@Param('id', new ParseUUIDPipe()) id: string): Promise<RoleMatrix> {
    return this.menuOptionsService.getRoleMatrix(id);
  }

  @Put(':id/roles/:roleId')
  @RequirePermission('UPDATE', 'menu-options')
  setRoleAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @Body() dto: SetRoleAccessDto,
  ): Promise<MenuOptionRoleEntity> {
    return this.menuOptionsService.setRoleAccess(id, roleId, dto);
  }

  // ── Endpoint assignment (F5.5.6) ──────────────────────────────────────

  /**
   * sc-334 admin-controles-enhancements Phase 1 (D1/R1) — list the
   * endpoints currently assigned to a menu option. Used by the
   * EndpointPickerComponent to hydrate its "Asignados" panel on select.
   *
   * 404 if the option itself does not exist (delegated to the service).
   */
  @Get(':id/endpoints')
  @RequirePermission('READ', 'menu-options')
  getAssignedEndpoints(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ApiEndpointEntity[]> {
    return this.menuOptionsService.getAssignedEndpoints(id);
  }

  @Put(':id/endpoints')
  @RequirePermission('UPDATE', 'menu-options')
  assignEndpoints(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignEndpointsDto,
  ): Promise<MenuOptionEndpointEntity[]> {
    return this.menuOptionsService.assignEndpoints(id, dto);
  }
}
