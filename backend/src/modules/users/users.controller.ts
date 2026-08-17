import {
  Body,
  Controller,
  Get,
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

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserEntity } from '../../entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserOrganizationDto } from './dto/update-user-organization.dto';
import { UploadedFile as AvatarFile } from './avatar-storage.service';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@Req() req: AuthenticatedRequest): Promise<UserEntity> {
    return this.usersService.findById(req.user!.userId);
  }

  @Patch('me')
  updateProfile(
    @Body() dto: UpdateProfileDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserEntity> {
    return this.usersService.updateProfile(req.user!.userId, {
      firstName: dto.first_name,
      lastName: dto.last_name,
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

  @Get()
  @RequirePermission('READ')
  list(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: UserEntity[]; total: number }> {
    return this.usersService.list(
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
      req.user!.scope,
      req.user!.userId,
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
