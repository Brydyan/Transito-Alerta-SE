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

import { AuthService, AuthTokens } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user?: { userId: string; permissions: string[] };
}

/**
 * AuthController (R1) — device-UUID login, refresh rotation, /api/auth/me,
 * logout. Implements design D1 (identity spectrum) + D2 (permissions
 * resolved from Redis, never embedded in JWT claims).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.authService.login(dto.device_uuid);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto): Promise<{ access_token: string }> {
    return this.authService.refresh(dto.refresh_token);
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

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(): { success: boolean } {
    // Stateless JWT: logout is a client-side token discard. Session
    // revocation (Sessions module, R15) is deferred to Phase 3 (T3.9).
    return { success: true };
  }
}
