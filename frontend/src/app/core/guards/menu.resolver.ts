import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { catchError, of, tap } from 'rxjs';
import { MenuService } from '../services/menu.service';
import { MenuItem } from '../models/menu.model';

/**
 * Resolver para cargar los elementos del menú del usuario antes de activar la ruta principal.
 * Esto asegura que el menú esté disponible antes de instanciar el MainLayout.
 *
 * F6 (debug) — agregado `tap` para loguear en consola qué está
 * retornando el resolver. Si la navegación se aborta con 404, este
 * log muestra si el resolver completó o si algo raro pasó.
 */
export const menuResolver: ResolveFn<MenuItem[]> = () => {
  const menuService = inject(MenuService);

  return menuService.getMenuFromBackend().pipe(
    tap((menu) => {
      // eslint-disable-next-line no-console
      console.log(
        '[menuResolver] getMenuFromBackend() completed:',
        menu.length,
        'items',
      );
    }),
    catchError((error) => {
      // eslint-disable-next-line no-console
      console.error(
        '[menuResolver] getMenuFromBackend() FAILED:',
        error?.status ?? 'no status',
        error?.message ?? error,
        '\n→ Degrading to [] to not block navigation',
      );
      // Retornamos un arreglo vacío en caso de fallo para no bloquear la navegación por completo
      return of([]);
    }),
  );
};
