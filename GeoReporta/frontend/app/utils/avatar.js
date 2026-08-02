/**
 * Shared avatar / user-display helpers used across the admin and citizen
 * shells.
 *
 * Single-source helpers extracted from `feed/feed.component.js` and
 * `feed/pages/detail/feed-detail.component.js`. The single-object-arg
 * signature on `getInitials` is intentional: it keeps the call shape
 * consistent across the four known call sites and matches the
 * `UserResource` payload shape returned by the API.
 *
 * Issue #234 — role-based anonymization. The backend may now return a
 * user payload with `is_anonymous: true` and the name fields stripped
 * to null (regular citizen viewer of someone else's report). The
 * helpers below branch on that flag so the UI never flashes a real
 * name where the backend redacted one.
 */

/**
 * Default avatar image, served statically by Vite from `public/`.
 * Shown whenever a user has no profile photo.
 */
export const DEFAULT_AVATAR = '/images/default-avatar.svg';

/**
 * Build a 1–2 character initials badge for a user object.
 *
 *   getInitials({ first_name: 'Ada', last_name: 'Lovelace' }) → 'AL'
 *   getInitials(null)                                          → '?'
 *   getInitials({ is_anonymous: true })                        → 'A'
 *   getInitials({})                                            → '?'
 */
export function getInitials(user) {
  if (!user) return '?';
  if (user.is_anonymous) {
    // Anonymous payload — no name parts. Fall back to the canonical
    // 'A' (for "Anónimo") so the avatar bubble still has a letter.
    return 'A';
  }
  const first = (user.first_name || '')[0] || '';
  const last = (user.last_name || '')[0] || '';
  return (first + last).toUpperCase() || '?';
}

/**
 * Build an avatar-cell HTML string for a user object.
 *
 * Uses `profile_image_path` (normalised to /storage/… when present) via
 * `resolveAvatar()`.  Falls back to the default avatar image when no
 * photo is available, styled to match the admin-shell avatar pattern.
 *
 * @param {object} user  – user resource with first_name, last_name,
 *                         profile_image_path, etc.
 * @returns {string} HTML string for a table-cell <td>.
 */
export function renderAvatarCell(user) {
  const src = resolveAvatarSrc(user.profile_image_path ?? user?.avatar);
  const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
  return `<td><img src="${src}" alt="${name}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;"></td>`;
}

/**
 * Build a round avatar <img> for a user object, falling back to the
 * default avatar image when no photo is available.
 *
 * @param {object} user    – user resource (may be null / anonymous).
 * @param {number} sizePx  – width/height of the image in pixels.
 * @returns {string} HTML string for an <img> element.
 */
export function renderAvatarImg(user, sizePx = 40) {
  const src = resolveAvatarSrc(user?.profile_image_path ?? user?.avatar);
  const name = getUserDisplayName(user);
  return `<img src="${src}" alt="${name}" style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;object-fit:cover;">`;
}

/**
 * Resolve a friendly display name for a user.
 *
 * Order of precedence:
 *   1. missing user                       → 'Anónimo'
 *   2. user.is_anonymous (issue #234)     → 'Anónimo'
 *   3. joined first + last name            → 'Ada Lovelace'
 *   4. name missing on real user          → 'Usuario'
 */
export function getUserDisplayName(user) {
  if (!user) return 'Anónimo';
  if (user.is_anonymous) return 'Anónimo';
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Usuario';
}

/**
 * Resolve an avatar URL from one of the supported payload shapes.
 *
 *   - `null` / `undefined`                → null
 *   - string                              → string as-is
 *   - `{ url: '…' }`                      → `url`
 *   - `{ urls: ['…', '…'] }`              → `urls[0]`
 *   - `[{ url: '…' }, '…']`               → first item's `url` or value
 */
export function resolveAvatar(avatar) {
  if (!avatar) return null;
  if (typeof avatar === 'string') return avatar;
  if (typeof avatar === 'object') {
    if (avatar.url) return avatar.url;
    if (Array.isArray(avatar.urls) && avatar.urls.length > 0)
      return avatar.urls[0];
    if (Array.isArray(avatar) && avatar.length > 0) {
      const first = avatar[0];
      return typeof first === 'string' ? first : first?.url || null;
    }
  }
  return null;
}

/**
 * Resolve a user avatar to a browser-ready image src.
 *
 *   - no avatar                    → DEFAULT_AVATAR
 *   - raw storage key ("users/5/…") → prefixed with /storage/
 *   - full URL / absolute path      → passed through as-is
 *
 * @param {*} avatar  – any shape accepted by `resolveAvatar()`.
 * @returns {string} an <img src>-ready URL.
 */
export function resolveAvatarSrc(avatar) {
  const resolved = resolveAvatar(avatar);
  if (!resolved) return DEFAULT_AVATAR;
  if (/^[a-z][a-z0-9+.-]*:/i.test(resolved) || resolved.startsWith('/'))
    return resolved;
  return '/storage/' + resolved;
}
