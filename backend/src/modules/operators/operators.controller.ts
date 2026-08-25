import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { UpdateLocationDto } from './dto/update-location.dto';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { OPERATOR_PING_ROLES, OPERATOR_QUERY_ROLES } from './operator-role.constants';
import { OperatorLocationService } from './operator-location.service';
import { OperatorDashboardService } from './operator-dashboard.service';

@Controller('operator')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OperatorsController {
  constructor(
    private readonly locationService: OperatorLocationService,
    private readonly dashboardService: OperatorDashboardService,
  ) {}

  @Post('location')
  @HttpCode(HttpStatus.OK)
  async recordLocation(
    @Body() dto: UpdateLocationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ status: string }> {
    const user = req.user!;
    const roleName = user.roleName ?? '';
    const isSystemAdmin = roleName === 'master';

    if (!isSystemAdmin && !(OPERATOR_PING_ROLES as readonly string[]).includes(roleName)) {
      throw new ForbiddenException('Operator role required to ping location');
    }

    const orgId = user.organizationId ?? 'system';
    await this.locationService.record(user.userId, orgId, dto.lat, dto.lng);
    return { status: 'ok' };
  }

  @Get('locations')
  async getLocations(@Req() req: AuthenticatedRequest) {
    const user = req.user!;
    const roleName = user.roleName ?? '';
    const isSystemAdmin = roleName === 'master';

    if (!isSystemAdmin && !(OPERATOR_QUERY_ROLES as readonly string[]).includes(roleName)) {
      throw new ForbiddenException('Operator or admin role required to view locations');
    }

    const operators = await this.locationService.activeFor(
      user.organizationId,
      isSystemAdmin,
    );
    return { operators };
  }

  @Get('dashboard')
  @RequirePermission('READ', 'dashboard')
  async getDashboard(
    @Query() query: DashboardQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user!;
    const roleName = user.roleName ?? '';

    if (!(OPERATOR_PING_ROLES as readonly string[]).includes(roleName)) {
      throw new ForbiddenException('Operator role required to access dashboard');
    }

    return this.dashboardService.forOperator(user.userId, query);
  }
}
