import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Route guard that blocks navigation when the current user lacks
 * the permission specified in `route.data.permission`.
 *
 * This is the security gate; the `*hasPermission` directive is
 * cosmetic only (hides UI elements).
 */
export const permissionGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const requiredPermission = route.data['permission'] as string | undefined;

  if (!requiredPermission) {
    return true;
  }

  const permissions = authService.currentUser()?.permissions ?? [];
  if (permissions.includes(requiredPermission)) {
    return true;
  }

  router.navigate(['/app/dashboard']);
  return false;
};
