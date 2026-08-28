import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MenuItem } from '../models/menu.model';
import { environment } from '../../../environments/environment';

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
   * Obtiene el menú desde el backend
   * El backend ya envía el menú filtrado según el rol del usuario
   */
  getMenuFromBackend(): Observable<MenuItem[]> {
    // El interceptor de autenticación se encarga de añadir el token automáticamente
    return this.http.get<MenuItem[]>(`${this.API_URL}/my`, { withCredentials: true }).pipe(
      map((menu) => this.formatRoutes(menu)),
      tap((menu) => {
        this.menuItemsSignal.set(menu);
      }),
    );
  }

  /**
   * Asegura que todas las rutas del menú comiencen con el prefijo /app
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
