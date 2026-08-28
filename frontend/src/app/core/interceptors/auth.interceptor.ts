import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Auth interceptor — bearer token + on-401 refresh.
 *
 * Change `2026-08-28-sc-203-auth-comments-backend-integration` 2nd
 * pass: dropped the pre-flight refresh branch because the backend's
 * `AuthTokens` does NOT expose the access-token expiry (no
 * `accessTokenInfo` block). The only signal we have for an expired
 * token is a 401 response. We refresh-and-retry once on 401; if
 * that also fails we log out.
 *
 * Single-flight refresh: a shared in-flight `refresh()` Observable
 * is cached on the service so concurrent calls all wait on the
 * same request — never two refreshes in parallel.
 *
 * Class-based (not `HttpInterceptorFn`) because the legacy
 * `HttpClientTestingModule` doesn't pick up function interceptors
 * registered via `HTTP_INTERCEPTORS`; function form needs
 * `provideHttpClient(withInterceptors(...))` which breaks the
 * legacy test setup.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly authService: AuthService;

  constructor() {
    this.authService = inject(AuthService);
  }

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    return next.handle(addAuthHeader(req, this.authService)).pipe(
      catchError((err: unknown) => {
        if (
          err instanceof HttpErrorResponse &&
          err.status === 401 &&
          !req.url.includes('/auth/refresh') &&
          !req.url.includes('/auth/login') &&
          !!this.authService.token()
        ) {
          // Token rejected: try one refresh, then retry the original.
          return this.authService.refresh().pipe(
            switchMap(() => next.handle(addAuthHeader(req, this.authService))),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}

function addAuthHeader(
  req: HttpRequest<unknown>,
  authService: AuthService,
): HttpRequest<unknown> {
  const token = authService.token();
  if (!token) {
    return req.clone();
  }
  return req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
}
