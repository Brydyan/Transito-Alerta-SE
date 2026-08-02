/**
 * Shared role / permission helpers used across the admin shell.
 *
 * Single-source helpers extracted from:
 *   - `auth/role.guard.js`        (resolveRoleName)
 *   - `layout/layout.component.js` (ROLE_LABELS, originally at line 123)
 *
 * `ROLE_LABELS` keys mirror the role names returned by the `UserResource`
 * (`{ id, name }` shape) — see `App\Domains\Roles\Enums\UserRole`.
 */

/**
 * Extract the role name from a user object, handling both
 * `{ role: { id, name } }` and `{ role: 'admin_sistema' }` payloads.
 *
 * Returns `null` when the user has no role or the shape is unrecognised.
 */
export function resolveRoleName(user) {
  if (!user?.role) return null;
  if (typeof user.role === 'string') return user.role;
  if (typeof user.role === 'object' && user.role?.name) return user.role.name;
  return null;
}

/**
 * Map from role name keys to Spanish display labels.
 */
export function homeRouteForUser(user) {
  const roleName = resolveRoleName(user);

  if (roleName === 'usuario') return '/feed';
  if (roleName === 'operador_organizacion') return '/operator/dashboard';

  return '/dashboard';
}

export const ROLE_LABELS = Object.freeze({
  admin_sistema: 'Super Administrador',
  admin_organizacion: 'Administrador de Organización',
  operador_organizacion: 'Operador de Organización',
  publicador: 'Publicador',
  usuario: 'Usuario',
  operador_sistema: 'Operador de Sistema',
});

/**
 * Roles that share the back-office chrome (admin sidebar + admin header).
 *
 * Single source of truth for the `admin` bucket used by `classifyRole()` in
 * `app-shell.component.js`. Exposing the constant (instead of hard-coding the
 * list inside `classifyRole`) keeps the bucket definition in one place so the
 * UI, the menu renderer, and any future role guard agree on the same names.
 * `usuario` is intentionally NOT in this list — citizen users get a distinct
 * shell.
 *
 * Frozen array: callers must not mutate the bucket at runtime. Add or remove
 * roles here when the underlying role catalogue changes.
 */
export const OPERATIONAL_ROLES = Object.freeze([
  'admin_sistema',
  'admin_organizacion',
  'operador_sistema',
  'operador_organizacion',
  'publicador',
]);
