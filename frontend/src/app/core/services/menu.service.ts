import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MenuItem } from '../models/menu.model';
import { environment } from '../../../environments/environment';

/**
 * Forma cruda que llega del backend en `GET /api/menus/my`.
 *
 * F1 (D3): el backend ahora envía `group?` y `order` además de los
 * originales. `group` agrupa entradas bajo un encabezado de sección;
 * `order` es el orden determinista (D3 explícitamente cierra la
 * fragilidad del orden de iteración de `Object.entries()` en el server).
 *
 * `group` es opcional en la respuesta: si el backend está desfasado
 * (F1.4.2) o si una entrada no pertenece a ninguna sección, el campo
 * se omite. La transformación no debe lanzar en ese caso.
 */
interface BackendMenuItem {
  label: string;
  route: string;
  icon?: string;
  group?: string;
  order?: number;
  /** F5 (D1): sub-ítems anidados bajo un encabezado de sección. */
  children?: BackendMenuItem[];
}

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  private readonly http = inject(HttpClient);
  // Eliminamos el inject de AuthService porque no se estaba usando
  private readonly API_URL = `${environment.apiUrl}/menus`;

  // Signal que almacena el menú recibido del backend
  private readonly menuItemsSignal = signal<MenuItem[]>([]);

  // Computed para exponer el menú de forma reactiva
  readonly menuItems = computed(() => this.menuItemsSignal());

  /**
   * Obtiene el menú desde el backend.
   * El backend envía `{ label, route, icon?, group?, order? }`; el
   * frontend espera `{ id, name, route, icon?, group?, menu_order, … }`,
   * así que transformamos acá.
   */
  getMenuFromBackend(): Observable<MenuItem[]> {
    return this.http
      .get<BackendMenuItem[]>(`${this.API_URL}/my`, { withCredentials: true })
      .pipe(
        map((backendMenu) => this.transformBackendMenu(backendMenu)),
        map((menu) => this.formatRoutes(menu)),
        tap((menu) => {
          this.menuItemsSignal.set(menu);
        }),
      );
  }

  /**
   * Transforma el formato del backend al formato del frontend.
   *
   * F1.4.2: propaga `group` cuando viene. Si la respuesta NO trae
   * `group` (backend desfasado, o entrada huérfana), la entrada se
   * transforma igual y renderiza sin encabezado — el sidebar ya sabe
   * manejar entradas sin grupo (F0.3 los pone antes del primer
   * encabezado).
   *
   * F1.4.1: `menu_order` toma el `order` del backend cuando existe;
   * si no (backend viejo), cae al índice del array para no romper el
   * orden de pintado. El orden visible real lo garantiza el
   * backend (D3); el índice es un fallback mientras coexistan
   * versiones.
   *
   * F5.6: propaga `children` recursivamente (contrato D1 anidado del
   * backend F5). Cada nodo recibe un `id` único por árbol y los hijos
   * apuntan a su padre vía `parent_menu_id`, para que el sidebar pueda
   * trackear sub-ítems y expandir/colapsar grupos. Antes de F5.6 los
   * children se pisaban con `[]` y el sidebar perdía todos los
   * sub-ítems (regresión 2026-09-14).
   *
   * sc-334 admin-controles-enhancements Phase 9 — sidebar depth cap at 2:
   * after migration 0060 added CRUD sub-sub-menus (3rd level under each
   * sub-menu: "Crear usuario", "Editar usuario", etc.), the backend
   * started including them in /api/menus/my. The sidebar was not designed
   * for 3-level expand/collapse — those CRUD items must render as flat
   * links under their level-2 parent, without their own chevron.
   *
   * El cap funciona así:
   *   - depth 0 (root): recurse a level-2 items (depth 1)
   *   - depth 1 (level 2): recurse a level-3 items (depth 2) como
   *     hijos visibles pero ya sin expansión posterior
   *   - depth 2+ (level 3+): nunca se alcanza — los items de nivel 3
   *     llegan al array pero sus `children` quedan en `[]`
   *
   * El admin screen `/app/admin/controles` lee de `/api/menu-options`
   * directo (no consume este transform), y mantiene el árbol completo
   * de 3 niveles vía menu-tree.component.ts.
   */
  private transformBackendMenu(items: BackendMenuItem[]): MenuItem[] {
    let nextId = 1;

    const transformNode = (item: BackendMenuItem, index: number, parentId?: number, depth = 0): MenuItem => {
      const id = nextId++;
      const out: MenuItem = {
        id,
        name: item.label,
        route: item.route,
        icon: item.icon,
        menu_order: item.order ?? index,
        is_active: true,
        children: [],
      };
      if (parentId !== undefined) {
        out.parent_menu_id = parentId;
      }
      if (item.group) {
        out.group = item.group;
      }
      // Phase 9 sidebar depth cap: recurse while depth < 2 so 3rd-level
      // items appear as flat links under their level-2 parent but never
      // expand further. Root = depth 0; level-2 = depth 1; level-3 = depth 2.
      if (depth < 2 && item.children && item.children.length > 0) {
        out.children = item.children.map((child, childIndex) =>
          transformNode(child, childIndex, id, depth + 1),
        );
      }
      return out;
    };

    return items.map((item, index) => transformNode(item, index));
  }

  /**
   * Asegura que todas las rutas del menú comiencen con el prefijo `/app`.
   *
   * F1.4.4: con las rutas del D4 (`/dashboard`, `/admin/users`, etc.) el
   * prefijado sigue siendo correcto — todas llegan sin `/app` y se
   * antepone una sola vez. La guarda `!startsWith('/app')` evita
   * duplicar el segmento si por error llega una ruta ya prefijada.
   */
  private formatRoutes(items: MenuItem[]): MenuItem[] {
    return items.map((item) => {
      const formattedItem = { ...item };

      if (formattedItem.route && !formattedItem.route.startsWith('/app')) {
        const prefix = formattedItem.route.startsWith('/') ? '/app' : '/app/';
        formattedItem.route = `${prefix}${formattedItem.route}`;
      }

      if (formattedItem.children && formattedItem.children.length > 0) {
        formattedItem.children = this.formatRoutes(formattedItem.children);
      }

      return formattedItem;
    });
  }

  /**
   * Cuenta todos los items del menú recursivamente, incluyendo children.
   * Útil para logs que necesitan mostrar el total de items, no solo root nodes.
   */
  countAllItems(items: MenuItem[]): number {
    return items.reduce((sum, item) => {
      const childCount = item.children?.length ?? 0;
      return sum + 1 + childCount;
    }, 0);
  }

  /**
   * Limpia el menú almacenado (útil en logout)
   */
  clearMenu(): void {
    this.menuItemsSignal.set([]);
  }
}
