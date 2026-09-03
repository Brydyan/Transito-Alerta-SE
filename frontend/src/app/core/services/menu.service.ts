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
   */
  private transformBackendMenu(items: BackendMenuItem[]): MenuItem[] {
    return items.map((item, index) => {
      const out: MenuItem = {
        id: index + 1,
        name: item.label,
        route: item.route,
        icon: item.icon,
        menu_order: item.order ?? index,
        is_active: true,
        children: [],
      };
      if (item.group) {
        out.group = item.group;
      }
      return out;
    });
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
   * Limpia el menú almacenado (útil en logout)
   */
  clearMenu(): void {
    this.menuItemsSignal.set([]);
  }
}
