import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../../shared/components/toast/toast.service';

interface IErrorResponse {
  statusCode: number;
  message: string;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const toastService = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const isAuthEndpoint =
        req.url.includes('/auth/login') ||
        req.url.includes('/auth/logout') ||
        req.url.includes('/auth/refresh');

      // Si recibimos 401 en un endpoint protegido, intentamos silent refresh una vez
      if (error.status === 401 && !isAuthEndpoint && !req.headers.has('X-Retry-Refresh')) {
        return authService.refreshToken().pipe(
          switchMap((refreshRes) => {
            // Reintentar la petición original con el nuevo token
            const retryReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${refreshRes.accessToken}`,
                'X-Retry-Refresh': 'true',
              },
              withCredentials: true,
            });
            return next(retryReq);
          }),
          catchError((refreshErr) => {
            // Si el refresh también falla (ej: cookie expirada o revocada)
            toastService.error('Su sesión ha expirado. Inicie sesión nuevamente.');
            authService.logout();
            return throwError(() => refreshErr);
          }),
        );
      }

      if (error.status === 401 && isAuthEndpoint && !req.url.includes('/auth/login')) {
        authService.logout();
      } else if (error.status === 403) {
        const errorResponse = error.error as IErrorResponse;
        const message =
          errorResponse?.message || 'No tienes permisos suficientes para realizar esta acción';
        toastService.error(message);
      }

      return throwError(() => error);
    }),
  );
};
