import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

/**
 * MenusModule (R16, T3.10) — design DAG `Menus -> Permissions` (spec).
 * Depends on AuthModule for AuthService.getPermissionsByUserId, the same
 * uid-keyed Redis path PermissionGuard's request.user.permissions already
 * warms — no direct TypeORM repos of its own (MENU_MAP is static, no DB).
 */
@Module({
  imports: [AuthModule],
  controllers: [MenusController],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
