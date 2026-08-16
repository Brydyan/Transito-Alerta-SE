import { Injectable } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { MENU_MAP, MenuEntry } from './menu-map';

/**
 * MenusService (R16) — serves dynamic navigation filtered by the caller's
 * permission set. Stateless: no DB storage, filters the static MENU_MAP.
 *
 * Resolves permissions via AuthService.getPermissionsByUserId — the SAME
 * uid-keyed Redis cache path (`perm:uid:{userId}`) JwtStrategy already
 * warms for every authenticated request, so this call is a cache hit in
 * the common case, not a second cold lookup.
 */
@Injectable()
export class MenusService {
  constructor(private readonly authService: AuthService) {}

  async getMenuForUser(userId: string): Promise<MenuEntry[]> {
    const permissions = await this.authService.getPermissionsByUserId(userId);

    return Object.entries(MENU_MAP)
      .filter(([, definition]) => permissions.includes(definition.requires))
      .map(([label, definition]) => {
        const entry: MenuEntry = { label, route: definition.route };
        if (definition.icon) {
          entry.icon = definition.icon;
        }
        return entry;
      });
  }
}
