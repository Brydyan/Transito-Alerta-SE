import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService, AuthTokens, RequestMeta } from '../auth/auth.service';
import { AcceptInvitationDto } from '../auth/dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationPreview, InvitationsService, InvitationSummary } from './invitations.service';

function requestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}

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
  constructor(
    private readonly invitationsService: InvitationsService,
    @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService,
  ) {}

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

  /**
   * T6.8.A3 — Path-param alias for preview (GeoReporta parity).
   * GET /invitations/:token/preview — same result as GET /invitations/preview?token=…
   */
  @Get('invitations/:token/preview')
  async previewByPath(@Param('token') token: string): Promise<InvitationPreview> {
    return this.invitationsService.previewInvitation(token);
  }

  /**
   * T6.8.A2 — POST /invitations/accept alias for POST /auth/accept-invitation.
   * Uses forwardRef AuthService to avoid a hard circular module dependency.
   */
  @Post('invitations/accept')
  @HttpCode(HttpStatus.CREATED)
  async acceptInvitationAlias(@Body() dto: AcceptInvitationDto, @Req() req: Request): Promise<AuthTokens> {
    const userId = await this.invitationsService.redeem(dto.token, dto.password, dto.terms_version);
    return this.authService.issueSessionForNewIdentity(userId, requestMeta(req));
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('DELETE', 'invitations')
  @Delete('invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.invitationsService.deletePending(id);
  }
}
