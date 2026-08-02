/**
 * auth.service.register() contract test — R11 frontend registration.
 *
 * The register endpoint returns 201 with `{ message: "..." }` and explicitly
 * does NOT issue a session. The service method MUST therefore:
 *   1. POST the validated payload to /register via http.service.
 *   2. Return the parsed response (so the component can read the message
 *      for the success banner).
 *   3. NOT call setAccessToken / setSessionId and NOT touch sessionStorage.
 *      Locked decision from clarifications #2300: no auto-login after
 *      registration — the user types credentials on the login form.
 *
 * This is the unit-level companion to the component-level R11 test in
 * `pages/login/login.component.test.js`. The component test mocks
 * `auth.service.register` and asserts the banner appears on 201; this test
 * pins the wire-level contract (path, payload, no token side-effect).
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

import { getAccessToken } from '../core/http.service.js';

describe('auth.service.register() — R11 wire contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('posts the payload to /register and returns the parsed response without storing a token', async () => {
    mockHttp.post.mockResolvedValue({
      message: 'Usuario creado correctamente',
    });

    const { auth } = await import('./auth.service.js');
    const payload = {
      first_name: 'Juan',
      last_name: 'Pérez',
      email: 'juan@example.com',
      phone: '099123456',
      password: 'Password1',
      password_confirmation: 'Password1',
    };

    const result = await auth.register(payload);

    // 1. Correct path + payload forwarded to http.post.
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post).toHaveBeenCalledWith('/register', payload);

    // 2. Response envelope returned as-is (so caller can show the message).
    expect(result).toEqual({ message: 'Usuario creado correctamente' });

    // 3. NO token side-effect — http.service keeps a module-scope cache
    //    and a sessionStorage mirror; both must remain untouched.
    expect(getAccessToken()).toBeNull();
    expect(sessionStorage.getItem('auth_token')).toBeNull();
    expect(sessionStorage.getItem('auth_session_id')).toBeNull();
  });
});
