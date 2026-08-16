import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoleEntity } from '../../entities/role.entity';
import { UserEntity } from '../../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

/**
 * RolesModule (R6/R7, T3.1) — design DAG `Roles -> Permissions`. Imports
 * AuthModule for AuthService.invalidatePermissionCache (D2 pv bump), not
 * for its guards (those come from common/guards directly, like every
 * other module).
 */
@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity, UserEntity]), AuthModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
