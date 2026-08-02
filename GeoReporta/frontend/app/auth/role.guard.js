/**
 * Role Guard — factory que crea guards de rol (canActivate).
 *
 * Uso:
 *   import { roleGuard } from './auth/role.guard.js';
 *   router.addRoute('/dashboard', dashboard, [roleGuard(['admin_sistema', 'admin_organizacion'])], 'admin');
 *
 * Redirige a /login si no hay sesión, o a /feed si el rol no está permitido.
 * El rol se obtiene del UserResource como { id, name } — accede a name.
 */
import { router } from '../core/router.js';
import { auth } from './auth.service.js';
import { resolveRoleName } from '../utils/role.js';

export function roleGuard(allowedRoles) {
  return {
    async canActivate() {
      if (!auth.isAuthenticated()) {
        router.navigate('/login');
        return false;
      }

      let user = auth.getUser();
      if (!user) {
        try {
          user = await auth.me();
        } catch {
          router.navigate('/login');
          return false;
        }
      }

      const roleName = resolveRoleName(user);
      if (!roleName || !allowedRoles.includes(roleName)) {
        router.navigate('/feed');
        return false;
      }

      return true;
    },
  };
}
