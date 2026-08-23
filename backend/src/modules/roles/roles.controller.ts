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
}
