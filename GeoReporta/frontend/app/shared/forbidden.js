import { menuService } from './menu.service.js';
import { permissionService } from './permission.service.js';

/**
 * Checks whether a caught request error is a 403, and if so, invalidates
 * the menu/permission caches (self-heals the guard's stale-cache-403-loop:
 * without this, permissionGuard keeps trusting the same cached "allowed"
 * answer for up to DEFAULT_TTL_MS after the backend has already revoked
 * the permission, so the user gets redirected back into the same 403 on
 * every retry within that window instead of a clean redirect once the
 * mismatch is known).
 *
 * Callers still own their own UI feedback (toast text, error-state
 * rendering differ per component) — this only centralizes the shared
 * "was it a 403, and if so heal the cache" logic.
 *
 * @param {{ status?: number }} err
 * @returns {boolean} true if this was a 403
 */
export function isForbidden(err) {
  if (err?.status !== 403) return false;

  menuService.invalidateMyMenu();
  permissionService.invalidateMyPermissions();

  return true;
}
