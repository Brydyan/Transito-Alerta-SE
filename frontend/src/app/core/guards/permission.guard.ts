import { computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Route guard that blocks navigation when the current user lacks
 * the permission specified in `route.data.permission`.
 *
 * This is the security gate; the `*hasPermission` directive is
 * cosmetic only (hides UI elements).
 *
 * On a full page load `AuthService.user` starts as `null` and is populated
 * asynchronously by `GET /auth/me`. Reading the signal synchronously here
 * therefore saw an empty permission list on every refresh and deep link,
 * and bounced the user to the dashboard even though they held the
 * permission. When a token was restored from storage but the session has
 * not hydrated yet, this guard waits for that request to settle instead of
 * deciding on incomplete state.
 */
export const permissionGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const requiredPermission = route.data['permission'] as string | undefined;

  if (!requiredPermission) {
    return true;
  }

  const decide = (user: { permissions: string[] } | null): boolean => {
    if (!user) {
      // Hydration finished with no session (e.g. `/auth/me` failed and
      // `clearAuthState()` ran). Send them to log in rather than to a
      // dashboard they also cannot see.
      router.navigate(['/login']);
      return false;
    }
    if (user.permissions.includes(requiredPermission)) {
      return true;
    }
    router.navigate(['/app/dashboard']);
    return false;
  };

  // Fast path — the session is already hydrated, so decide synchronously
  // and keep navigation free of an extra microtask.
  const current = authService.currentUser();
  if (current !== null) {
    return decide(current);
  }

  // No token at all: `authGuard` owns the redirect to /login.
  if (!authService.isAuthenticated()) {
    return decide(null);
  }

  // A token was restored from storage but `GET /auth/me` is still in
  // flight. Settle when the user lands, or when the token is cleared
  // because that request failed — never hang on one that resolves neither
  // way.
  const settled = computed(() => ({
    user: authService.currentUser(),
    authenticated: authService.isAuthenticated(),
  }));

  return toObservable(settled).pipe(
    filter(({ user, authenticated }) => user !== null || !authenticated),
    take(1),
    map(({ user }) => decide(user)),
  );
};
