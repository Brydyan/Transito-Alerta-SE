import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { AuthService, AuthTokens, RequestMeta } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

function requestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}

/**
 * AuthController (R1; T3.9 design §6) — device-UUID login, refresh
 * rotation, /api/auth/me, logout. Implements design D1 (identity
 * spectrum) + D2 (permissions resolved from Redis, never embedded in JWT
 * claims). `refresh()` now returns the full `AuthTokens` (breaking API
 * change, design §11 item 1) — never only an access token.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthTokens> {
    return this.authService.login(dto.device_uuid, requestMeta(req));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthTokens> {
    return this.authService.refresh(dto.refresh_token, requestMeta(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ user_id: string; device_uuid: string; permissions: string[] }> {
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
