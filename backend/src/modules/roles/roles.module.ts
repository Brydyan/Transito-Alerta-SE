import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoleEntity } from '../../entities/role.entity';
import { UserEntity } from '../../entities/user.entity';
import { RoleRankAudit } from '../../common/authz/role-rank.audit';
import { AuthModule } from '../auth/auth.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
/**
 * RolesModule (R6/R7, T3.1) — design DAG `Roles -> Permissions`. Imports
 * AuthModule for AuthService.invalidatePermissionCache (D2 pv bump), not
 * for its guards (those come from common/guards directly, like every
 * other module). Also hosts `RoleRankAudit` (T3.2 design D9/D10) — the
 * boot-time assertion that every seeded role name has a `ROLE_RANK`
 * entry; `RoleEntity` is already registered here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity, UserEntity]), AuthModule],
  controllers: [RolesController],
  providers: [RolesService, RoleRankAudit],
  exports: [RolesService],
})
export class RolesModule {}
