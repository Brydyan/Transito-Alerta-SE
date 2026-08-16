import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserEntity } from '../../entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadedFile as AvatarFile } from './avatar-storage.service';
import { UsersService } from './users.service';

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; permissions: string[] };
}

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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: UserEntity[]; total: number }> {
    return this.usersService.list(
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
