/**
 * Auth Service — login, logout, refresh, me.
 *
 * - Tokens stored in http.service.js module memory (not localStorage)
 * - Refresh token stored in HttpOnly cookie (managed by backend)
 *
 * SECURITY PRINCIPLE — no cache:
 *   Auth state is **never cached locally**. Every `auth.me()` call hits
 *   `/me` against the backend. `login.user` is for UI hints only and
 *   does NOT contain the `role` field — only `/me` does.
 *
 *   Rationale: Cached role can become stale when the backend changes a
 *   user's role, locks the account, or revokes the session. Security
 *   decisions (route guards, role-mismatch checks, role-driven chrome)
 *   MUST always reflect the current backend state.
 *
 *   Trade-off: every /me call is ~30-80ms over LAN. Acceptable for the
 *   security guarantee.
 */
import {
  http,
  setAccessToken,
  setSessionId,
  clearAuthState,
  getSessionId,
  getAccessToken,
} from '../core/http.service.js';
import { menuService } from '../shared/menu.service.js';
import { permissionService } from '../shared/permission.service.js';
import { mapaService } from '../mapa/mapa.service.js';

class AuthService {
  constructor() {
    this._authChangeCallbacks = [];
    // No _cachedUser. Always-on /me for role + identity.
  }

  async login(email, password) {
    const data = await http.post('/login', { email, password });
    setAccessToken(data.access_token);
    setSessionId(data.session_id);
    // Notify subscribers (router role tracker, appShell header) that
    // auth state has changed. Without this call, the router stays in
    // 'guest' and the appShell never gets the new role/avatar.
    this._notifyAuthChange();
    return data;
  }

  /**
   * Register a new citizen account (R11).
   *
   * POSTs the validated payload to /register and returns the 201 envelope
   * unchanged so the caller can read `message` for the success banner.
   *
   * **No auto-login.** Locked product decision from clarifications #2300:
   * a successful registration does NOT issue a session — the user stays on
   * /login and types their credentials. This method therefore intentionally
   * does NOT call setAccessToken / setSessionId and does NOT touch
   * sessionStorage. The component is responsible for showing the banner and
   * switching back to the login form.
   *
   * The 422 path falls through to the caller's catch block; http.service
   * attaches `err.status` and `err.errors` to the thrown Error so the
   * component can render field-level errors without re-parsing.
   */
  async register(payload) {
    const data = await http.post('/register', payload);
    return data;
  }

  /**
   * Exchange a Firebase ID token for an application session (R12).
   *
   * The flow is: Firebase Auth SDK returns an `id_token`, we POST it
   * to `/auth/google`, the backend verifies it via Kreait (see PR-2's
   * GoogleAuthService + KreaitFirebaseTokenVerifier), and on success
   * the backend issues an app session (200 with `access_token` body
   * + refresh/mercure HttpOnly cookies). On 200 we mirror `login()`:
   * store the access token + session id in the http.service cache,
   * notify auth-change subscribers, then fetch `/me` once so the
   * caller can redirect by role without a hand-rolled fetch.
   *
   * On 401 the backend returns one of two spec messages per R9/R10:
   *   - "Token de Google inválido"          (invalid/expired token)
   *   - "Esta cuenta ya existe, iniciá sesión con tu contraseña"
   *     (existing user with email_verified_at IS NULL — R9 path)
   * http.service attaches `err.status` and `err.message` onto a
   * thrown Error; this method propagates it unchanged so the
   * component can render the spec copy into `#login-error`.
   *
   * No auto-login for the 201 register path (R11) — locked decision
   * from clarifications #2300. The Google path DOES auto-login because
   * the spec explicitly says R12 ends with a session issuance and a
   * role-based redirect (the user already authenticated with Google).
   *
   * @param {{ idToken: string }} args
   * @returns {Promise<{ user: object }>}
   * @throws  {Error} status=401 on invalid token or rejected unverified account
   */
  async googleLogin({ idToken }) {
    const data = await http.post('/auth/google', { id_token: idToken });
    setAccessToken(data.access_token);
    setSessionId(data.session_id);
    // Same notifyAuthChange call as login() — router guards + appShell
    // observe the new auth state in lockstep.
    this._notifyAuthChange();
    // /me is always-on (no caching in auth.service by design) — fetch
    // once here so the component can read the role for the redirect.
    const user = await this.me();
    return { user };
  }

  async logout() {
    try {
      await http.post('/logout', { _session_id: getSessionId() });
    } catch {
      // Clear state even if server call fails
    }
    // Cache invalidation (T-2.11 / menu-server-driven PR 2): a stale
    // /menus/my from a previous user or the previous session must NEVER
    // leak into the next logged-in user's sidebar. Clear both caches
    // BEFORE notifying subscribers so any handler that reads them
    // observes a clean slate. permissionService is the same class of
    // cache (backs permissionGuard's CHILD_ROUTE_PERMISSIONS check) and
    // must be cleared for the identical reason — without this, logging
    // out of an admin_sistema session and into a less-privileged one
    // within the TTL window serves the PREVIOUS user's full permission
    // set to the guard.
    menuService.invalidateMyMenu();
    permissionService.invalidateMyPermissions();
    // mapaService is user-agnostic by default (keys on bbox/zoom/filters
    // only). Without an explicit invalidate on logout, a stored bbox-page
    // response for one user could be served to the next logged-in user.
    // Defense in depth: the service also includes the user id in its
    // cache key (see mapa.service.js → buildCacheKey), but the explicit
    // invalidate here is the primary guarantee.
    mapaService.invalidate();
    clearAuthState();
    this._notifyAuthChange();
  }

  /**
   * Accept an invitation and set the user's password.
   *
   * POSTs to /invitations/{token}/accept with password + T&C acceptance.
   * Unlike login(), this endpoint does NOT issue a JWT — the user must
   * log in with their new credentials after the redirect.
   *
   * @param {string} tokenPlain       — plaintext token from the URL
   * @param {string} password         — new password
   * @param {string} confirmPassword  — password confirmation (mirrors backend confirmed rule)
   * @param {boolean} acceptTerms      — must be true
   * @returns {Promise<{message: string}>}
   * @throws {InvitationGoneError}     on 410 (expired/consumed)
   * @throws {InvitationNotFoundError} on 404 (invalid token)
   * @throws {Error} status=422 with err.errors for field-level errors
   */
  async acceptInvitation(tokenPlain, password, confirmPassword, acceptTerms) {
    // Lazy-import to avoid a circular dependency at module load time.
    const { acceptInvitation: svcAccept } =
      await import('../invitations/invitation.service.js');
    return svcAccept(tokenPlain, password, confirmPassword, acceptTerms, 'v0');
  }

  /**
   * Fetch current user from backend. ALWAYS hits /me.
   * Never cached — see SECURITY PRINCIPLE above.
   */
  async me() {
    const data = await http.get('/me');
    return data.data || data;
  }

  /**
   * Synchronous getter removed. Always use `await auth.me()` instead.
   * Returning null forces callers to make their code async and to
   * fetch fresh state instead of trusting a cached user object.
   */
  getUser() {
    return null;
  }

  isAuthenticated() {
    return !!getAccessToken();
  }

  /** Subscribe to auth state changes. Returns an unsubscribe function. */
  onAuthChange(callback) {
    this._authChangeCallbacks.push(callback);
    return () => {
      const idx = this._authChangeCallbacks.indexOf(callback);
      if (idx >= 0) this._authChangeCallbacks.splice(idx, 1);
    };
  }

  _notifyAuthChange() {
    this._authChangeCallbacks.forEach((cb) => cb());
  }

  async tryRestoreSession() {
    try {
      const data = await http.post('/auth/refresh');
      setAccessToken(data.access_token);
    } catch {
      // No valid refresh cookie — user must log in
    }
  }
}

export const auth = new AuthService();
