/**
 * Auth Guard — equivalente a canActivate de Angular.
 *
 * Si no hay token, redirige a /login.
 */
import { router } from '../core/router.js';
import { getAccessToken } from '../core/http.service.js';

export const authGuard = {
  async canActivate() {
    if (!getAccessToken()) {
      router.navigate('/login');
      return false;
    }
    return true;
  },
};
