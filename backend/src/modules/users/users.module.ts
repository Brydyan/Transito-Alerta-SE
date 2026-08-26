import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoleEntity } from '../../entities/role.entity';
import { OrganizationEntity } from '../../entities/organization.entity';
import { UserEntity } from '../../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AvatarStorageService } from './avatar-storage.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * UsersModule (R4; T3.9 design §8) — design DAG: `Users -> Roles,
 * Organizations (optional), Sessions (repository only)`. Imports
 * AuthModule (T3.2 D12) for `AuthService.invalidatePermissionCache` on org
 * moves — same pattern as RolesModule. Imports `SessionsModule` (T3.9) for
 * `SessionsRepository` — the fan-out write path (`UserSessionEntity`
 * injection, `recordSession`, `handleAuthLogin`) is REMOVED (D2):
 * `AuthService`, via `SessionsRepository`, is now the sole writer of
 * `user_sessions`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, RoleEntity, OrganizationEntity]),
    AuthModule,
    SessionsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, AvatarStorageService],
  exports: [UsersService],
})
export class UsersModule {}
