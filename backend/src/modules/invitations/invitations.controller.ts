import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationPreview, InvitationsService, InvitationSummary } from './invitations.service';

/**
 * InvitationsController (T3.6 design §6.2). No class-level `@Controller()`
 * prefix — routes span two path families per `spec.md`
 * (`admin/users/invite` vs `invitations/*`), unlike every other controller
 * in this codebase.
 *
 * Route order matters: `invitations/pending` and `invitations/preview` are
 * declared BEFORE `invitations/:id` so the literal segments are never
 * swallowed by the `:id` param (same gotcha as `geo-zones`' `GET /tree`).
 */
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('CREATE', 'invitations')
  @Post('admin/users/invite')
  @HttpCode(HttpStatus.CREATED)
  async invite(
    @Body() dto: CreateInvitationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<InvitationSummary> {
    return this.invitationsService.createInvitation(req.user!, {
      email: dto.email,
      roleId: dto.role_id,
      organizationId: dto.organization_id ?? null,
    });
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('READ', 'invitations')
  @Get('invitations/pending')
  async pending(@Req() req: AuthenticatedRequest): Promise<InvitationSummary[]> {
    return this.invitationsService.listPending(req.user!);
  }

  /** No auth, no permission — the pre-account bootstrap step (spec "Authorization"). */
  @Get('invitations/preview')
  async preview(@Query('token') token: string): Promise<InvitationPreview> {
    return this.invitationsService.previewInvitation(token);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('DELETE', 'invitations')
  @Delete('invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.invitationsService.deletePending(id);
  }
}
