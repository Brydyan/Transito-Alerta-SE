import { Injectable } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { MENU_MAP, MenuEntry } from './menu-map';

/**
 * MenusService (R16) — sirve la navegación dinámica filtrada por el
 * conjunto de permisos del llamante. Stateless: sin BD, filtra el
 * `MENU_MAP` estático.
 *
 * F1 (D3): propaga `group` y `order` desde la definición al `MenuEntry`
 * resultante, y ordena por `order` ascendente antes de devolver. El
 * filtrado por `definition.requires ∈ permissions` no cambia. Los
 * grupos que quedan vacíos tras el filtrado se omiten (no se emite
 * ningún `MenuEntry` con `group: 'GESTIÓN'` si el usuario no tiene
 * permiso para ver ninguna entrada de ese grupo).
 *
 * Resuelve permisos vía `AuthService.getPermissionsByUserId` — el mismo
 * path de caché Redis keyed por uid (`perm:uid:{userId}`) que
 * `JwtStrategy` calienta en cada request autenticado, por lo que esta
 * llamada es un cache hit en el caso común, no un segundo lookup en frío.
 */
@Injectable()
export class MenusService {
  constructor(private readonly authService: AuthService) {}

  async getMenuForUser(userId: string): Promise<MenuEntry[]> {
    const permissions = await this.authService.getPermissionsByUserId(userId);

    // 1. Filtrar por permisos.
    // 2. Propagar group, order, icon.
    // 3. Ordenar por `order` ascendente (D3: el orden de Object.entries()
    //    no es determinista en todas las plataformas — fue la fragilidad
    //    original que este cambio cierra).
    return Object.entries(MENU_MAP)
      .filter(([, definition]) => permissions.includes(definition.requires))
      .map(([label, definition]) => {
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
