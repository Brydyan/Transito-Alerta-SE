import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom, filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * 2026-09-15-auth-token-expiration-fix — both guards are now async
 * CanActivateFn returning Promise<boolean>.
 *
 * The race we close: pre-fix, the guard evaluated `isAuthenticated()`
 * synchronously while `hydrateSession()` was still in flight against
 * `/auth/me`. A user with an expired token in localStorage would be
 * treated as authenticated, `guestGuard` would redirect them away from
 * `/registro` (the sc-207 bug), and `/app/dashboard` would render
 * briefly with a broken layout before the eventual 401 cleared the
 * session. The fix: wait for `sessionValidationComplete` to flip to
 * true, THEN consult `isAuthenticated()` (which itself now decodes the
 * JWT `exp` claim).
 */
function awaitValidationComplete(authService: AuthService) {
  return firstValueFrom(
    toObservable(authService.sessionValidationComplete).pipe(
      filter((isComplete) => isComplete),
      take(1),
      map(() => undefined),
    ),
  );
}

/**
 * Guards authenticated routes. Redirects to /login on failure, carrying
 * the original URL so the user lands back where they were after
 * re-authenticating.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return awaitValidationComplete(authService).then(() => {
    if (authService.isAuthenticated()) {
      return true;
    }
    router.navigate(['/login'], {
      queryParams: { returnUrl: state.url },
    });
    return false;
  });
};

/**
 * Guards guest routes (/login, /registro, /verify-email). Redirects an
 * already-authenticated user to /app/dashboard so they don't see the
 * "you are already signed in" flow twice.
 */
export const guestGuard: CanActivateFn = (_route, _state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return awaitValidationComplete(authService).then(() => {
    if (!authService.isAuthenticated()) {
      return true;
    }
    router.navigate(['/app/dashboard']);
    return false;
  });
};
