import { Controller, Get, UseGuards } from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionEntity } from '../../entities/permission.entity';
import { PermissionsService } from './permissions.service';

/** PermissionsController (R7) — read-only catalog endpoint. */
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermission('READ')
  findAll(): Promise<PermissionEntity[]> {
    return this.permissionsService.findAll();
  }
}
