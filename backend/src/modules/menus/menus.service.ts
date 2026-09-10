import { Injectable, Logger } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { PermissionLookupService } from '../../common/permissions/permission-lookup.service';
import { MENU_MAP, MenuEntry } from './menu-map';

/**
 * MenusService (R16) — sirve la navegación dinámica filtrada por el
 * conjunto de permisos del llamante. Stateless: sin BD, filtra el
 * `MENU_MAP` estático.
 *
 * F1 (D3): propaga `group` y `order` desde la definición al `MenuEntry`
 * resultante, y ordena por `order` ascendente antes de devolver.
 *
 * F6 fix (post-0051): los permisos se almacenan como UUIDs en
 * `users.permissions` (migration 0051) y en la cache Redis. El
 * `MENU_MAP.requires` sigue siendo strings formateados
 * ("READ users") — la única fuente de verdad para la traducción
 * `(action, resource) → uuid` es `PermissionLookupService`, el
 * mismo resolver que usa `PermissionGuard.hasPermission`. Sin
 * este cambio, `permissions.includes('READ users')` siempre
 * retornaba `false` y la sidebar quedaba vacía para master.
 *
 * Resuelve permisos vía `AuthService.getPermissionsByUserId` — el mismo
 * path de caché Redis keyed por uid (`perm:uid:{userId}`) que
 * `JwtStrategy` calienta en cada request autenticado, por lo que esta
 * llamada es un cache hit en el caso común, no un segundo lookup en frío.
 */
@Injectable()
export class MenusService {
  private readonly logger = new Logger(MenusService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly permissionLookup: PermissionLookupService,
  ) {}

  async getMenuForUser(userId: string): Promise<MenuEntry[]> {
    const permissions = await this.authService.getPermissionsByUserId(userId);

    // F6 defensive: si la cache tiene un valor con formato viejo (pre-0051
    // guardó `string[]` de strings formateados, o un objeto con
    // `permissions` undefined), evitamos el 500 que producía
    // `undefined.includes(...)` y degradamos a menú vacío. El log
    // permite detectar caches corruptas en staging.
    if (!Array.isArray(permissions)) {
      this.logger.warn(
        `getMenuForUser(${userId}): permissions not array (got ${typeof permissions}); degrading to []`,
      );
      return [];
    }

    // 1. Resolver (action, resource) → uuid por cada entrada del mapa.
    // 2. Filtrar si el uuid está en los permisos del usuario.
    // 3. Propagar group, order, icon.
    // 4. Ordenar por `order` ascendente.
    const resolved: Array<{ label: string; definition: (typeof MENU_MAP)[string] }> = [];
    for (const [label, definition] of Object.entries(MENU_MAP)) {
      const uuid = await this.permissionLookup.getUuid(
        // MENU_MAP.requires es "ACTION resource"; descomponemos para el
        // resolver. Todos los requires actuales siguen este formato.
        ...(definition.requires.split(' ', 2) as [string, string]),
      );
      if (uuid !== null && permissions.includes(uuid)) {
        resolved.push({ label, definition });
      }
    }

    return resolved
      .map(({ label, definition }) => {
        const entry: MenuEntry = {
          label,
          route: definition.route,
          order: definition.order,
        };
        if (definition.icon) {
          entry.icon = definition.icon;
        }
        if (definition.group) {
          entry.group = definition.group;
        }
        return entry;
      })
      .sort((a, b) => a.order - b.order);
  }
}
