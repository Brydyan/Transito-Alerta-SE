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
  Req,
  UseGuards,
} from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserEntity } from '../../entities/user.entity';
import { RoleEntity } from '../../entities/role.entity';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleStatsDto } from './dto/role-stats.dto';
import { SyncPermissionsDto } from './dto/sync-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

/**
 * RolesController (R6/R7). Assigning a role requires the ASSIGN permission
 * on `roles` — mirrors AssignmentsController's pattern for the same
 * PermissionAction (T2.4).
 */
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get(':id/permissions')
  @RequirePermission('READ')
  listPermissions(@Param('id') id: string): Promise<string[]> {
    return this.rolesService.listPermissions(id);
  }

  @Post(':id/assign')
  @RequirePermission('ASSIGN')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserEntity> {
    return this.rolesService.assignRole(req.user!, dto.user_id, id);
  }

  // ---- T5.6 CRUD: list / show / create / update / delete / syncPermissions

  @Get()
  @RequirePermission('READ')
  findAll(): Promise<RoleEntity[]> {
    return this.rolesService.findAll();
  }

  /**
   * Change `2026-09-09-roles-stats-endpoint` — métricas agregadas para
   * las 3 cards del pie de `/app/admin/roles` (mock 04-01).
   *
   * **Route order matters** (D5 del design): este `@Get('stats')` va
   * ANTES de `@Get(':id')` — si fuera al revés, NestJS intentaría
   * parsear `"stats"` como UUID vía `ParseUUIDPipe` y retornaría 400.
   * Mismo gotcha que `backend/src/modules/incidents/incidents.controller.ts`
   * documenta para sus rutas literales.
   *
   * Permiso `READ` (D2): universal para admins que ven la lista —
   * no se separa en permiso custom.
   */
  @Get('stats')
  @RequirePermission('READ')
  getStats(): Promise<RoleStatsDto> {
    return this.rolesService.getStats();
  }

  @Get(':id')
  @RequirePermission('READ')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<RoleEntity> {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermission('CREATE')
  create(@Body() dto: CreateRoleDto): Promise<RoleEntity> {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('UPDATE')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleEntity> {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.rolesService.delete(id);
  }

  @Put(':id/permissions')
  @RequirePermission('UPDATE')
  syncPermissions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SyncPermissionsDto,
  ): Promise<RoleEntity> {
    return this.rolesService.syncPermissions(id, dto.permissions);
  }

  /**
   * T7.2.C4 (R7.6) — re-derives this role's effective permission set,
   * dropping any string whose (resource, action) pair is soft-deleted in
   * the `permissions` catalog, and propagates the result to every user
   * currently holding the role.
   */
  @Post(':id/recalculate-permissions')
  @RequirePermission('UPDATE')
  recalculatePermissions(@Param('id', new ParseUUIDPipe()) id: string): Promise<RoleEntity> {
    return this.rolesService.recalculateEffectivePermissions(id);
  }
}
