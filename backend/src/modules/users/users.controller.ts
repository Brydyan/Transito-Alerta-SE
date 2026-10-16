import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PermissionGuard } from '../../shared/guards/permission.guard';
import { AuthenticatedRequest } from '../../shared/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserEntity } from './entities/user.entity';
import { SessionResponseDto } from '../sessions/dto/session-response.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { FormDataResponseDto } from './dto/form-data-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserOrganizationDto } from './dto/update-user-organization.dto';
import { UploadedFile as AvatarFile } from './avatar-storage.service';
import { UsersService } from './users.service';
import { TelegramLinkService } from '../telegram/telegram-link.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly telegramLinkService: TelegramLinkService,
  ) {}

  @Get('me')
  me(@Req() req: AuthenticatedRequest): Promise<UserEntity> {
    return this.usersService.findById(req.user!.userId);
  }

  // T5.4 — must come BEFORE any `:id` route (defense in depth, even though
  // no `@Get(':id')` exists today; protects against future route additions).
  @Get('form-data')
  @RequirePermission('READ', 'users')
  getFormData(@Req() req: AuthenticatedRequest): Promise<FormDataResponseDto> {
    return this.usersService.getFormData(req.user!);
  }

  @Patch('me')
  updateProfile(
    @Body() dto: UpdateProfileDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserEntity> {
    return this.usersService.updateProfile(req.user!.userId, {
      firstName: dto.first_name,
      lastName: dto.last_name,
      phone: dto.phone,
    });
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  updateAvatar(
    @UploadedFile() file: AvatarFile,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserEntity> {
    return this.usersService.updateAvatar(req.user!.userId, file);
  }

  /** T3.9 D9 — self, no `@RequirePermission` decorator (self bypass). */
  @Get('me/sessions')
  meSessions(@Req() req: AuthenticatedRequest): Promise<SessionResponseDto[]> {
    return this.usersService.getSessionsForSelf(req.user!);
  }

  /**
   * D3 — `POST /api/users/me/telegram-link` (2026-10-11-user-form-departments-telegram-hybrid).
   *
   * Issues a fresh Telegram deep-link token for the authenticated staff user.
   * Blocked for `reporter` role (citizens cannot link to the admin bot).
   * Protected by `JwtAuthGuard`; no extra `@RequirePermission` (self-service).
   */
  @Post('me/telegram-link')
  async generateTelegramLink(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ telegram_link: string | null }> {
    if (req.user!.roleName === 'reporter') {
      throw new ForbiddenException(
        'Los reporteros no pueden vincularse al bot de Telegram de gestión interna.',
      );
    }
    const token = await this.telegramLinkService.issueFor(req.user!.userId);
    const telegram_link = this.telegramLinkService.composeDeepLink(token);
    return { telegram_link };
  }

  // ---- T5.6 admin CRUD: create / show / update / delete
  // Declared BEFORE `:id` and `:id/...` to avoid the literal segment
  // being captured as an id param (defense in depth).

  @Post()
  @RequirePermission('CREATE')
  adminCreate(@Body() dto: AdminCreateUserDto): Promise<UserEntity> {
    return this.usersService.adminCreate(dto);
  }

  @Get(':id')
  @RequirePermission('READ')
  adminShow(@Param('id', ParseUUIDPipe) id: string): Promise<UserEntity> {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @RequirePermission('UPDATE')
  adminUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
    // 2026-10-15-user-status-notif-channel — the new `is_active` field
    // is Master-only at the service layer (self-deactivation guard +
    // role gate). The controller hands `req.user!.userId` and
    // `req.user!.roleName` to the service so the guard works without
    // a second round-trip to the auth layer. `roleName` is nullable on
    // `AuthContext`; an absent role cannot be master, so the service
    // guard naturally drops `is_active`.
    @Req() req: AuthenticatedRequest,
  ): Promise<UserEntity> {
    return this.usersService.adminUpdate(
      id,
      dto,
      req.user!.userId,
      req.user!.roleName ?? '',
    );
  }

  @Delete(':id')
  @RequirePermission('DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  adminDelete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.usersService.softDelete(id);
  }

  /**
   * T3.9 D9 — a READ, so `@RequirePermission('READ', 'sessions')` gates
   * the flat capability; `UsersService.getSessionsForUser` additionally
   * enforces visibility (404) via `assertVisible`, never rank.
   */
  @Get(':id/sessions')
  @RequirePermission('READ', 'sessions')
  userSessions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<SessionResponseDto[]> {
    return this.usersService.getSessionsForUser(req.user!, id);
  }

  @Get()
  @RequirePermission('READ')
  list(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    // 2026-10-16 — toggle "mostrar inactivos" en la lista de
    // usuarios. Wire values: `active=true` → solo activos;
    // `active=false` → solo inactivos (shadow-users de adminCreate);
    // ausente → todos (default histórico, isActive=true).
    // `forbidNonWhitelisted` is NOT enabled globally here — the
    // controller does not apply ValidationPipe for query params on
    // this route, so unknown values (`active=foo`) fall through to
    // `activeOnly = undefined` and the caller still gets the full
    // list (defensive).
    @Query('active') active?: string,
  ): Promise<{ items: UserEntity[]; total: number }> {
    const activeOnly =
      active === undefined
        ? undefined
        : active === 'true'
          ? true
          : active === 'false'
            ? false
            : undefined;

    return this.usersService.list(
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
      req.user!.scope,
      req.user!.userId,
      activeOnly,
    );
  }

  /**
   * `PATCH /api/users/:id/organization` (T3.2 design D12). Rank/visibility
   * enforcement (`assertCanManage`, 404/403) happens in the service — the
   * guard only checks the flat `UPDATE users` permission string.
   */
  @Patch(':id/organization')
  @RequirePermission('UPDATE')
  updateOrganization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserOrganizationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserEntity> {
    return this.usersService.updateOrganization(req.user!, id, dto.organization_id);
  }
}
