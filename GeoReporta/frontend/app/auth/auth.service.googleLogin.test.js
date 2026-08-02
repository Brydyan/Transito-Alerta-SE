/**
 * auth.service.googleLogin() contract test — R12 frontend Google sign-in.
 *
 * The /auth/google backend endpoint (PR-2, R7–R10) accepts a Firebase ID
 * token and returns a fresh session (200 with `access_token` body +
 * refresh/mercure cookies). The service method MUST therefore:
 *
 *   1. POST { id_token } to /auth/google via http.service.
 *   2. On 200: store access_token + session_id via the existing in-memory
 *      token helpers, then call `_notifyAuthChange()` so router guards
 *      + appShell observe the new state.
 *   3. Fetch /me once and return `{ user }` so the component can read
 *      the role without a second hand-rolled fetch.
 *   4. On 401: surface the http.service error unchanged (it already
 *      attaches `err.status` and `err.message`). The component renders
 *      the backend's spec copy into `#login-error`.
 *
 * Wire-format contract:
 *   - Path: `/auth/google`  (NOT `/login`, NOT `/auth/refresh`).
 *   - Body key: `id_token`  (snake_case — matches the backend's
 *     GoogleLoginRequest validation rule per design #2304).
 *
 * This is the unit-level companion to the component-level R12 tests in
 * `pages/login/login.component.test.js`. The component test mocks
 * `auth.service.googleLogin` and asserts the redirect-by-role; this
 * test pins the wire-level contract (path, payload, token side-effect,
 * /me follow-up, error shape).
 */

const mockHttp = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: [] }),
  post: vi.fn().mockResolvedValue({ data: {} }),
  put: vi.fn().mockResolvedValue({ data: {} }),
  patch: vi.fn().mockResolvedValue({ data: {} }),
  delete: vi.fn().mockResolvedValue(null),
}));

vi.mock('../core/http.service.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    setAccessToken: mod.setAccessToken,
    clearAuthState: mod.clearAuthState,
    http: mockHttp,
  };
});

import {
  getAccessToken,
  getSessionId,
  setAccessToken,
  setSessionId,
} from '../core/http.service.js';

describe('auth.service.googleLogin() — R12 wire contract', () => {
  beforeEach(() => {
    mockHttp.post.mockReset();
    mockHttp.get.mockReset();
    sessionStorage.clear();
    // Reset the in-memory token caches as well — http.service reads
    // them at module load from sessionStorage but also maintains a
    // module-private cache.
    setAccessToken(null);
    setSessionId(null);
  });

  it('posts the id_token to /auth/google, stores the token, fetches /me, and returns { user } on 200', async () => {
    mockHttp.post.mockResolvedValueOnce({
      access_token: 'google-access-token-xyz',
      session_id: 'sess-42',
      token_type: 'Bearer',
      expires_in: 900,
      user: {
        id: 7,
        email: 'juan@gmail.com',
        first_name: 'Juan',
        last_name: 'Pérez',
        role: { name: 'usuario' },
      },
    });
    mockHttp.get.mockResolvedValueOnce({
      data: {
        id: 7,
        email: 'juan@gmail.com',
        first_name: 'Juan',
        last_name: 'Pérez',
        role: { name: 'usuario' },
      },
    });

    const { auth } = await import('./auth.service.js');
    const result = await auth.googleLogin({ idToken: 'firebase-id-token-abc' });

    // 1. Wire: POST /auth/google with { id_token }.
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post).toHaveBeenCalledWith('/auth/google', {
      id_token: 'firebase-id-token-abc',
    });

    // 2. After the 200, /me is fetched once to load the authoritative
    //    user/role into the auth service.
    expect(mockHttp.get).toHaveBeenCalledTimes(1);
    expect(mockHttp.get).toHaveBeenCalledWith('/me');

    // 3. Tokens stored via the in-memory helper — the same plumbing
    //    email/password login uses, so the token-store contract is
    //    identical.
    expect(getAccessToken()).toBe('google-access-token-xyz');
    expect(getSessionId()).toBe('sess-42');

    // 4. The method resolves to { user } so the component can read
    //    the role for the /feed or /dashboard redirect.
    expect(result).toEqual({
      user: expect.objectContaining({
        id: 7,
        email: 'juan@gmail.com',
        role: { name: 'usuario' },
      }),
    });
  });

  it('R12: propagates a typed 401 error unchanged — the component decides which copy to show', async () => {
    // The backend returns 401 with one of two messages per spec R9/R10:
    //   - "Token de Google inválido"       (R10)
    //   - "Esta cuenta ya existe, iniciá sesión con tu contraseña"  (R9)
    // http.service attaches status+message+errors onto a thrown Error;
    // googleLogin MUST surface this so the component can branch on it
    // and render the spec copy into #login-error.
    const backendError = new Error(
      'Esta cuenta ya existe, iniciá sesión con tu contraseña',
    );
    backendError.status = 401;
    mockHttp.post.mockRejectedValueOnce(backendError);

    const { auth } = await import('./auth.service.js');

    await expect(
      auth.googleLogin({ idToken: 'malformed' }),
    ).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('iniciá sesión con tu contraseña'),
    });

    // Critically, NO token side-effect happened on the failure path.
    expect(getAccessToken()).toBeNull();
    expect(getSessionId()).toBeNull();
    // /me is not called when /auth/google rejected.
    expect(mockHttp.get).not.toHaveBeenCalled();
  });
});
