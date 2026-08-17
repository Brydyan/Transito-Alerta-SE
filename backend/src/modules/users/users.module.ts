import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoleEntity } from '../../entities/role.entity';
import { UserEntity } from '../../entities/user.entity';
import { UserSessionEntity } from '../../entities/user-session.entity';
import { AuthModule } from '../auth/auth.module';
import { AvatarStorageService } from './avatar-storage.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * UsersModule (R4) — design DAG: `Users -> Roles, Organizations
 * (optional)`. Imports AuthModule (T3.2 D12) for
 * `AuthService.invalidatePermissionCache` on org moves — same pattern as
 * RolesModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserSessionEntity, RoleEntity]), AuthModule],
  controllers: [UsersController],
  providers: [UsersService, AvatarStorageService],
  exports: [UsersService],
})
export class UsersModule {}
