import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { InvitationsService } from '../invitations/invitations.service';
import { AuthService, AuthTokens, RequestMeta } from './auth.service';
import { resolveCredential } from './credential-dispatch';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';

function requestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}

/**
 * AuthController (R1; T3.9 design §6; T3.6 design D1/D2) — device-UUID
 * login, password login, refresh rotation, invitation redemption, password
 * reset, /api/auth/me, logout. `login()` dispatches on `resolveCredential`
 * (D1) — the device branch's diff from pre-T3.6 is exactly "dispatch
 * through a pure function before calling the same `authService.login`".
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly invitationsService: InvitationsService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  /**
   * T6.8.C1 — POST /auth/register tombstone (GeoReporta parity).
   * Registration is invitation-only; return 410 Gone so API clients can
   * surface a meaningful error rather than 404.
   */
  @Post('register')
  @HttpCode(HttpStatus.GONE)
  register(): { message: string } {
    return { message: 'Registration is invitation-only. Contact an administrator.' };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthTokens> {
    const credential = resolveCredential(dto);
    if (credential.kind === 'device') {
      return this.authService.login(credential.deviceUuid, requestMeta(req));
    }
    return this.authService.loginWithPassword(
      { email: credential.email, password: credential.password, deviceUuid: credential.deviceUuid },
      requestMeta(req),
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthTokens> {
    return this.authService.refresh(dto.refresh_token, requestMeta(req));
  }

  /**
   * T3.6 — `InvitationsService.redeem`, `201` + a live session (spec
   * "Invitation Lifecycle"). `issueSessionForNewIdentity` runs here,
   * STRICTLY AFTER `redeem`'s transaction has committed (design "Component
   * Design") — kept in the controller, not `InvitationsService`, so
   * `InvitationsModule` never needs to import `AuthModule` back (see
   * `InvitationsService.redeem`'s doc comment).
   */
  @Post('accept-invitation')
  @HttpCode(HttpStatus.CREATED)
  async acceptInvitation(@Body() dto: AcceptInvitationDto, @Req() req: Request): Promise<AuthTokens> {
    const userId = await this.invitationsService.redeem(dto.token, dto.password, dto.terms_version);
    return this.authService.issueSessionForNewIdentity(userId, requestMeta(req));
  }

  /** T3.6 D9 — ALWAYS 202, whatever the email (no user enumeration). */
  @Post('password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  async passwordReset(@Body() dto: PasswordResetRequestDto): Promise<void> {
    await this.passwordResetService.requestReset(dto.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async passwordResetConfirm(@Body() dto: PasswordResetConfirmDto): Promise<void> {
    await this.passwordResetService.confirmReset(dto.token, dto.password);
  }

  /** T3.6 — SELF-only, no `@RequirePermission` (mirrors T3.9's self-session-revoke bypass). */
  @UseGuards(JwtAuthGuard)
  @Put('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const userId = req.user!.userId;
    await this.authService.changePassword(userId, dto.current_password, dto.new_password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ user_id: string; device_uuid: string | null; permissions: string[] }> {
    const userId = req.user!.userId;
    const { deviceUuid, permissions } = await this.authService.getMe(userId);
    return { user_id: userId, device_uuid: deviceUuid, permissions };
  }

  /**
   * T3.9 — no longer a no-op: revokes the caller's own session (spec
   * "POST /api/auth/logout revokes the caller's own session; the token
   * used to call it is dead on the next request"). Anonymous identities
   * carry no `sessionId` — nothing to revoke, so this is a harmless no-op
   * for them, matching D8 (anonymous tokens stay unrevokable).
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: AuthenticatedRequest): Promise<{ success: boolean }> {
    const sessionId = req.user!.sessionId;
    if (sessionId) {
      await this.authService.revokeSession(sessionId);
    }
    return { success: true };
  }
}
