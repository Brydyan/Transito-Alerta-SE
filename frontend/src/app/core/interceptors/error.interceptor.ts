import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../../shared/components/toast/toast.service';

interface IErrorResponse {
  statusCode: number;
  message: string;
}

/**
 * NO maneja 401. Eso es responsabilidad EXCLUSIVA de `authInterceptor`.
 *
 * Hasta ahora los dos interceptores atrapaban el mismo 401 y los dos
 * llamaban a `authService.refresh()`. El single-flight de `refresh()` se
 * libera en cuanto el primero tiene éxito (`refreshInProgress$ = null` en su
 * `tap`), así que el segundo salía como POST nuevo — con el refresh token que
 * el primero ya había rotado. Para el backend eso es reuso de token
 * (`SESSION_REUSE_DETECTED`) y revoca la sesión entera.
 *
 * Se manifestaba sólo al arrancar la app, no al iniciar sesión: el login es
 * una secuencia única, mientras que un arranque limpio dispara `/auth/me`
 * (constructor de AuthService) y `/menus/my` (menuResolver) EN PARALELO. Dos
 * 401 simultáneos, dos refresh cruzados, sesión revocada, y el usuario de
 * vuelta al login cada vez que recargaba.
 *
 * Un 401 tiene un solo dueño. `authInterceptor` ya tiene el single-flight y
 * el reintento; acá quedan sólo los errores que nadie más traduce a UI.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 403) {
        const errorResponse = error.error as IErrorResponse;
        const message =
          errorResponse?.message || 'No tienes permisos suficientes para realizar esta acción';
        toastService.error(message);
      }

      return throwError(() => error);
    }),
  );
};
