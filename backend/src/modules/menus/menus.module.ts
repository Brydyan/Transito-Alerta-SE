import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { ApiEndpointEntity } from './entities/api-endpoint.entity';
import { MenuOptionEndpointEntity } from './entities/menu-option-endpoint.entity';
import { UserEntity } from '../../entities/user.entity';
import { RoleEntity } from '../../entities/role.entity';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';
import { MenuOptionsController } from './menu-options.controller';
import { MenuOptionsService } from './menu-options.service';

/**
 * MenusModule (F5 — dynamic menus).
 *
 * Now resolves menus from the database (D1/D3/D4) instead of the
 * static MENU_MAP. The module registers the four new entities and
 * the MenusService which queries them.
 *
 * D7: `menu-map.ts` stays in the repo as the rollback path.
 * D4: `menu:v1:*` cache key space is SEPARATE from `perm:v3:uid:*`.
 */
@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      MenuOptionEntity,
      MenuOptionRoleEntity,
      ApiEndpointEntity,
      MenuOptionEndpointEntity,
      UserEntity,
      RoleEntity,
    ]),
  ],
  controllers: [MenusController, MenuOptionsController],
  providers: [MenusService, MenuOptionsService],
  exports: [MenusService, MenuOptionsService],
})
export class MenusModule {}
