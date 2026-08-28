import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Auth interceptor — bearer token + on-401 refresh.
 *
 * Single-flight refresh: a shared in-flight `refresh()` Observable
 * is cached on the service so concurrent calls all wait on the
 * same request — never two refreshes in parallel.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.token();

  // Add auth header
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.includes('/auth/refresh') &&
        !req.url.includes('/auth/login') &&
        !!authService.token()
      ) {
        // Token rejected: try one refresh, then retry the original.
        return authService.refresh().pipe(
          switchMap(() => {
            let retryReq = req;
            const newToken = authService.token();
            if (newToken) {
              retryReq = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` },
              });
            }
            return next(retryReq);
          }),
        );
      }
      return throwError(() => err);
    }),
  );
};
