import { Controller, Post, Delete, Param, Body, Req, HttpCode, HttpStatus, UseGuards, UnauthorizedException } from '@nestjs/common';
import { IncidentSocialService } from './incident-social.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';

@Controller('incidents/:id')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncidentSocialController {
  constructor(private readonly socialService: IncidentSocialService) {}

  @Post('followers')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('CREATE', 'incident-followers')
  async follow(@Param('id') incidentId: string, @Req() req: AuthenticatedRequest) {
    if (!req.user) throw new UnauthorizedException('Session missing');
    await this.socialService.follow(incidentId, req.user.userId);
  }

  @Delete('followers')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('DELETE', 'incident-followers')
  async unfollow(@Param('id') incidentId: string, @Req() req: AuthenticatedRequest) {
    if (!req.user) throw new UnauthorizedException('Session missing');
    await this.socialService.unfollow(incidentId, req.user.userId);
  }

  @Post('corroborations')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('CREATE', 'incident-corroborations')
  async corroborate(
    @Param('id') incidentId: string,
    @Req() req: AuthenticatedRequest,
    @Body('comment') comment: string | null
  ) {
    if (!req.user) throw new UnauthorizedException('Session missing');
    await this.socialService.corroborate(incidentId, req.user.userId, comment);
  }
}
