import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserEntity } from '../../entities/user.entity';
import { AssignRoleDto } from './dto/assign-role.dto';
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
  assign(@Param('id') id: string, @Body() dto: AssignRoleDto): Promise<UserEntity> {
    return this.rolesService.assignRole(dto.user_id, id);
  }
}
