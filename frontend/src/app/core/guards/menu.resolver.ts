import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { catchError, of } from 'rxjs';
import { MenuService } from '../services/menu.service';
import { MenuItem } from '../models/menu.model';

/**
 * Resolver para cargar los elementos del menú del usuario antes de activar la ruta principal.
 * Esto asegura que el menú esté disponible antes de instanciar el MainLayout.
 */
export const menuResolver: ResolveFn<MenuItem[]> = () => {
  const menuService = inject(MenuService);

  return menuService.getMenuFromBackend().pipe(
    catchError((error) => {
      console.error('Error al resolver el menú en el Route Resolver:', error);
      // Retornamos un arreglo vacío en caso de fallo para no bloquear la navegación por completo
      return of([]);
    }),
  );
};
