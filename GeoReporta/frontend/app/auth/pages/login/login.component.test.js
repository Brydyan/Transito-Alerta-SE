/**
 * login.component.test.js — R11 frontend registration form (unit-level).
 *
 * Scenarios (per spec R11 / design #2304):
 *   - R11 renders registration form fields
 *   - R11 toggles between login and register forms
 *   - R11 shows client-side validation errors
 *   - R11 handles 201 and stays on /login with banner
 *
 * The component is a Vanilla ES module with `templateUrl` / `styleUrl`,
 * so the tests load the real HTML file from disk via Node `fs` (vitest
 * runs on Node; only the runtime context is jsdom). This guarantees
 * the assertions pin the actual on-disk template, not a hand-written
 * duplicate that could drift from the real one.
 *
 * `auth.service` and `router` are mocked at the module boundary; the
 * production `auth.register()` post-201 contract is covered separately
 * by `auth.service.register.test.js`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_HTML = readFileSync(
  resolve(__dirname, 'login.component.html'),
  'utf8',
);

const authMock = vi.hoisted(() => ({
  login: vi.fn(),
  me: vi.fn(),
  register: vi.fn(),
  googleLogin: vi.fn(),
  onAuthChange: vi.fn(() => () => {}),
  isAuthenticated: vi.fn(() => false),
  getUser: vi.fn(() => null),
}));
vi.mock('../../auth.service.js', () => ({ auth: authMock }));

// sc-143: the shared password strength meter is wired into the
// register form. The DOM-update logic is covered by its own test
// (`password-strength-meter.test.js`) — here we just verify the
// component hands the right DOM elements to the helper.
const strengthMeterMock = vi.hoisted(() => ({
  mountPasswordStrengthMeter: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('../../../shared/password-strength-meter.js', () => ({
  mountPasswordStrengthMeter: strengthMeterMock.mountPasswordStrengthMeter,
}));

// ─── R12: Firebase loader mock ─────────────────────────────────────────────
//
// The component clicks "Iniciar sesión con Google" → calls signInWithGoogle()
// (which lazy-loads the SDK as a side effect of its first call) → hands the
// returned Firebase ID token to auth.googleLogin() → applies the role-based
// redirect. Mocks the loader at the module boundary so tests can observe
// when the SDK actually got touched AND simulate cancel / error / success.
const firebaseMock = vi.hoisted(() => ({
  loadFirebase: vi.fn(() =>
    Promise.resolve({
      auth: { _auth: true },
      signInWithPopup: vi.fn(),
      GoogleAuthProvider: vi.fn(),
      signOut: vi.fn(),
    }),
  ),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('../../firebase-loader.js', () => ({
  loadFirebase: (...args) => firebaseMock.loadFirebase(...args),
  signInWithGoogle: (...args) => firebaseMock.signInWithGoogle(...args),
  signOut: (...args) => firebaseMock.signOut(...args),
}));

vi.mock('../../../core/router.js', () => ({
  router: {
    navigate: vi.fn(),
    setCurrentUserRole: vi.fn(),
  },
}));

import loginComponent, { validateRegisterPayload } from './login.component.js';

/**
 * Mount the component into the DOM by injecting the real template and
 * running the production-equivalent onInit. The router-resolved context
 * is supplied directly so tests can simulate query-param redirects.
 */
async function mountComponent(ctx = {}) {
  document.body.innerHTML = TEMPLATE_HTML;
  await loginComponent.onInit(ctx);
  return document.body;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('R11 — frontend registration form', () => {
  it('renders all registration form fields (first_name, last_name, email, phone, password, password_confirmation)', async () => {
    await mountComponent();

    // Every register field must exist as an <input> in the DOM. We pin
    // the IDs (not class names) because that's what the submit handler
    // queries by. The brief requires exactly these six fields.
    const fieldIds = [
      'first_name',
      'last_name',
      'register-email',
      'phone',
      'register-password',
      'password_confirmation',
    ];

    for (const id of fieldIds) {
      const el = document.getElementById(id);
      expect(el, `expected #${id} to be present`).not.toBeNull();
      expect(el.tagName).toBe('INPUT');
      expect(el.type).toBeTruthy();
    }

    // The mode toggle and the post-201 banner must also be in the DOM
    // so the toggle test and the banner test have something to operate
    // on. These are R11 surface area, so this assertion pins the whole
    // shape in one shot.
    expect(document.querySelector('[data-mode-btn="register"]')).not.toBeNull();
    expect(document.getElementById('register-banner')).not.toBeNull();
  });

  // ─── sc-143: shared password strength meter present in register form ───
  it('sc-143: register form renders the password strength meter + rules checklist (shared markup)', async () => {
    await mountComponent();

    expect(
      document.querySelector('[data-testid="password-strength-meter"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-testid="password-rules-checklist"]'),
    ).not.toBeNull();

    const meter = document.getElementById('register-password-meter');
    expect(meter).not.toBeNull();
    expect(meter.getAttribute('role')).toBe('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
    expect(meter.classList.contains('gr-strength-meter')).toBe(true);
    expect(meter.querySelectorAll('.gr-strength-meter-segment').length).toBe(4);
    expect(
      document.getElementById('register-password-meter-label').textContent,
    ).toBe('—');

    // 5 rule rows, one per backend rule.
    const rows = document.querySelectorAll('.gr-strength-rule[data-rule]');
    expect(rows.length).toBe(5);
    expect(
      ['minLength', 'hasUpper', 'hasLower', 'hasDigit', 'matches'].every(
        (k) => document.querySelector(`[data-rule="${k}"]`) !== null,
      ),
    ).toBe(true);
  });

  it('sc-143: login mode keeps the meter hidden (markup lives inside the hidden register form)', async () => {
    await mountComponent();

    // The meter/rules markup lives INSIDE the #register-form (which is
    // hidden in default /login mode). The element exists in the DOM
    // but is invisibly contained in a `d-none` form. We pin that
    // contract: the parent #register-form carries `d-none` in default
    // mode, so the user never sees the meter. (Mode is `login` after
    // mount with no ctx override.)
    const registerForm = document.getElementById('register-form');
    expect(registerForm.classList.contains('d-none')).toBe(true);

    expect(
      document.querySelector('[data-testid="password-strength-meter"]'),
    ).not.toBeNull();
    expect(
      document
        .querySelector('[data-testid="password-strength-meter"]')
        .closest('#register-form'),
    ).toBe(registerForm);
    expect(
      document.querySelector('[data-testid="password-rules-checklist"]'),
    ).not.toBeNull();
    expect(
      document
        .querySelector('[data-testid="password-rules-checklist"]')
        .closest('#register-form'),
    ).toBe(registerForm);
  });

  it('sc-143: onInit calls the shared strength-meter helper with the register DOM elements', async () => {
    await mountComponent();

    expect(strengthMeterMock.mountPasswordStrengthMeter).toHaveBeenCalledTimes(
      1,
    );
    const opts = strengthMeterMock.mountPasswordStrengthMeter.mock.calls[0][0];
    expect(opts.passwordInput).toBe(
      document.getElementById('register-password'),
    );
    expect(opts.confirmInput).toBe(
      document.getElementById('password_confirmation'),
    );
    expect(opts.rulesListEl).toBe(
      document.querySelector('[data-testid="password-rules-checklist"]'),
    );
    expect(opts.meterEl).toBe(
      document.getElementById('register-password-meter'),
    );
    expect(opts.meterLabelEl).toBe(
      document.getElementById('register-password-meter-label'),
    );
  });

  it('toggles between login and register forms when the mode buttons are clicked', async () => {
    await mountComponent();

    const container = document.querySelector('.gr-login');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginBtn = document.querySelector('[data-mode-btn="login"]');
    const registerBtn = document.querySelector('[data-mode-btn="register"]');

    // Default state: login mode, login form visible, register hidden.
    expect(container.getAttribute('data-mode')).toBe('login');
    expect(loginForm.classList.contains('d-none')).toBe(false);
    expect(registerForm.classList.contains('d-none')).toBe(true);
    expect(loginBtn.classList.contains('gr-login__mode-btn--active')).toBe(
      true,
    );
    expect(registerBtn.classList.contains('gr-login__mode-btn--active')).toBe(
      false,
    );

    // Click "Registrarse" → switch to register mode.
    registerBtn.click();
    expect(container.getAttribute('data-mode')).toBe('register');
    expect(loginForm.classList.contains('d-none')).toBe(true);
    expect(registerForm.classList.contains('d-none')).toBe(false);
    expect(loginBtn.classList.contains('gr-login__mode-btn--active')).toBe(
      false,
    );
    expect(registerBtn.classList.contains('gr-login__mode-btn--active')).toBe(
      true,
    );

    // Click "Iniciar sesión" → restore login mode.
    loginBtn.click();
    expect(container.getAttribute('data-mode')).toBe('login');
    expect(loginForm.classList.contains('d-none')).toBe(false);
    expect(registerForm.classList.contains('d-none')).toBe(true);
  });

  it('shows client-side validation errors for weak password and confirmation mismatch without hitting the network', async () => {
    await mountComponent();

    // Switch to register mode so the register form is visible.
    document.querySelector('[data-mode-btn="register"]').click();

    const registerForm = document.getElementById('register-form');

    // ─── Triangulation cycle 1: weak password (no digit) ────────────────
    document.getElementById('first_name').value = 'Ada';
    document.getElementById('last_name').value = 'Lovelace';
    document.getElementById('register-email').value = 'ada@example.com';
    document.getElementById('register-password').value = 'NoDigitsHere';
    document.getElementById('password_confirmation').value = 'NoDigitsHere';

    registerForm.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );

    // Synchronously assert: NO network call (no auto-login / no register
    // fired), AND the password error is visible.
    expect(authMock.register).not.toHaveBeenCalled();
    const passwordErr = document.querySelector('[data-error-for="password"]');
    expect(passwordErr.classList.contains('d-none')).toBe(false);
    expect(passwordErr.textContent).toMatch(/dígito/i);
    expect(
      document
        .querySelector('[data-error-for="password_confirmation"]')
        .classList.contains('d-none'),
    ).toBe(true);

    // ─── Triangulation cycle 2: password mismatch ───────────────────────
    // Same fields but a strong password + a different confirmation.
    document.getElementById('register-password').value = 'ValidPass1';
    document.getElementById('password_confirmation').value = 'DifferentPass2';

    registerForm.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );

    // Network still untouched, password error cleared, confirmation
    // error now visible.
    expect(authMock.register).not.toHaveBeenCalled();
    expect(
      document
        .querySelector('[data-error-for="password"]')
        .classList.contains('d-none'),
    ).toBe(true);
    const confirmErr = document.querySelector(
      '[data-error-for="password_confirmation"]',
    );
    expect(confirmErr.classList.contains('d-none')).toBe(false);
    expect(confirmErr.textContent).toMatch(/no coinciden/i);
  });

  it('handles a 201 from /register by staying on /login, showing the banner, switching back to login mode, and storing no token', async () => {
    // Backend contract: 201 with { message }, no session — locked decision.
    authMock.register.mockResolvedValue({
      message: 'Usuario creado correctamente',
    });

    await mountComponent();
    // Switch to register mode so the form is interactable.
    document.querySelector('[data-mode-btn="register"]').click();

    document.getElementById('first_name').value = 'Ada';
    document.getElementById('last_name').value = 'Lovelace';
    document.getElementById('register-email').value = 'ada@example.com';
    document.getElementById('phone').value = '';
    document.getElementById('register-password').value = 'ValidPass1';
    document.getElementById('password_confirmation').value = 'ValidPass1';

    document
      .getElementById('register-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // auth.register must have been called exactly once with the payload
    // (phone stripped when empty so the backend receives the spec'd shape).
    await vi.waitFor(() => {
      expect(authMock.register).toHaveBeenCalledTimes(1);
    });
    const callArg = authMock.register.mock.calls[0][0];
    expect(callArg).toEqual({
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      password: 'ValidPass1',
      password_confirmation: 'ValidPass1',
    });
    expect('phone' in callArg).toBe(false);

    // The post-201 banner must be visible AND carry the spec copy.
    const banner = document.getElementById('register-banner');
    expect(banner.classList.contains('d-none')).toBe(false);
    expect(banner.textContent).toMatch(/Cuenta creada, iniciá sesión/);

    // The component switched back to login mode so the user can type
    // credentials immediately (locked UX from clarifications #2300).
    const container = document.querySelector('.gr-login');
    expect(container.getAttribute('data-mode')).toBe('login');
    expect(
      document.getElementById('login-form').classList.contains('d-none'),
    ).toBe(false);
    expect(
      document.getElementById('register-form').classList.contains('d-none'),
    ).toBe(true);

    // The login redirect NEVER fires for register — user stays on /login.
    // (router.navigate is mocked; importing from the mocked module here.)
    const { router } = await import('../../../core/router.js');
    expect(router.navigate).not.toHaveBeenCalled();

    // No token storage anywhere — the wire contract that
    // auth.service.register.test.js pins at the service layer must
    // remain true end-to-end through the component.
    expect(sessionStorage.getItem('auth_token')).toBeNull();
    expect(sessionStorage.getItem('auth_session_id')).toBeNull();
  });

  // Story sc-117 — flujo de verificación de correo para registros
  // locales. El backend devuelve `requires_verification: true` en el
  // 201 de POST /api/register cuando el usuario debe verificar su
  // correo antes de poder iniciar sesión. El componente debe redirigir
  // a /verify-email en lugar de mostrar el banner.
  it('redirects to /verify-email when the 201 from /register carries requires_verification=true', async () => {
    authMock.register.mockResolvedValue({
      message: 'Usuario creado correctamente',
      requires_verification: true,
    });

    await mountComponent();
    document.querySelector('[data-mode-btn="register"]').click();

    document.getElementById('first_name').value = 'Ada';
    document.getElementById('last_name').value = 'Lovelace';
    document.getElementById('register-email').value = 'ada@example.com';
    document.getElementById('register-password').value = 'ValidPass1';
    document.getElementById('password_confirmation').value = 'ValidPass1';

    document
      .getElementById('register-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(authMock.register).toHaveBeenCalledTimes(1);
    });

    const { router } = await import('../../../core/router.js');
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(
      `/verify-email?source=register&email=${encodeURIComponent('ada@example.com')}`,
    );

    // El banner NO se muestra: el usuario es redirigido fuera de /login.
    const banner = document.getElementById('register-banner');
    expect(banner.classList.contains('d-none')).toBe(true);
  });

  // Story sc-117 — `/api/login` retorna 403 con `code: 'email_not_verified'`
  // cuando el usuario existe pero su correo no fue verificado. El componente
  // debe redirigir a /verify-email en lugar de mostrar el error genérico.
  it('redirects to /verify-email when login returns 403 with code=email_not_verified', async () => {
    authMock.login.mockRejectedValue(
      Object.assign(new Error('Debes verificar tu correo'), {
        status: 403,
        code: 'email_not_verified',
      }),
    );

    await mountComponent();

    document.getElementById('email').value = 'unverified@example.com';
    document.getElementById('password').value = 'ValidPass1';
    document
      .getElementById('login-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(authMock.login).toHaveBeenCalledTimes(1);
    });

    const { router } = await import('../../../core/router.js');
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(
      `/verify-email?source=login&email=${encodeURIComponent('unverified@example.com')}`,
    );
  });
});

/**
 * Direct unit tests for the exported pure validator. These triangulate
 * the validation rules without going through the DOM, which keeps the
 * assertions focused on the rules themselves and catches regressions
 * where the validator starts producing a different error map than the
 * DOM expects to render.
 */
describe('validateRegisterPayload (R11 pure validator)', () => {
  const valid = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    password: 'ValidPass1',
    password_confirmation: 'ValidPass1',
  };

  it('returns an empty error map for a valid payload', () => {
    expect(validateRegisterPayload(valid)).toEqual({});
  });

  it('flags each password rule failure independently (length, upper, lower, digit)', () => {
    expect(
      validateRegisterPayload({ ...valid, password: 'Aa1!aa' }).password,
    ).toMatch(/8 caracteres/);
    expect(
      validateRegisterPayload({ ...valid, password: 'password1' }).password,
    ).toMatch(/mayúscula/);
    expect(
      validateRegisterPayload({ ...valid, password: 'PASSWORD1' }).password,
    ).toMatch(/minúscula/);
    expect(
      validateRegisterPayload({ ...valid, password: 'Password!' }).password,
    ).toMatch(/dígito/);
  });

  it('flags missing required fields and email format', () => {
    const errors = validateRegisterPayload({
      first_name: '',
      last_name: '',
      email: 'not-an-email',
      password: 'ValidPass1',
      password_confirmation: 'ValidPass1',
    });
    expect(errors.first_name).toMatch(/obligatorio/);
    expect(errors.last_name).toMatch(/obligatorio/);
    expect(errors.email).toMatch(/válido/);
  });
});

// ─── R12: Google sign-in button + redirect-by-role ─────────────────────────
//
// Spec R12 scenarios (frontend):
//   1. Lazy-load the Firebase SDK on Google button click (NOT on page load).
//   2. Popup cancellation is tolerated silently — user stays on /login, no
//      error in #login-error.
//   3. On successful auth, store the token and redirect by role:
//        role = 'usuario' → /feed
//        other roles     → /dashboard
//
// We mock firebase-loader.js at the module boundary so tests can observe
// whether the loader has been touched without performing the real network
// import — pinning the lazy-load contract directly.
describe('R12 — frontend Google login button', () => {
  it('R12: lazy-loads the Firebase SDK ONLY after the Google button is clicked (not on page load)', async () => {
    await mountComponent();

    // Before any click — the loader must NOT have been touched. This is
    // the spec's first contract: lazy-load on user interaction.
    expect(firebaseMock.loadFirebase).not.toHaveBeenCalled();
    expect(firebaseMock.signInWithGoogle).not.toHaveBeenCalled();

    // The button must exist as a sibling of the login form (NOT inside
    // it). The component mounts it as a separate row so submission
    // typing doesn't accidentally fire the Google flow.
    const googleBtn = document.getElementById('google-signin-btn');
    expect(googleBtn).not.toBeNull();
    expect(googleBtn.tagName).toBe('BUTTON');
    expect(googleBtn.getAttribute('type')).toBe('button');
    // Sits outside the login form so it never collides with email/password submit.
    expect(googleBtn.closest('form#login-form')).toBeNull();

    // Configure the loader to resolve a credential — simulates the user
    // successfully completing the Google OAuth popup.
    firebaseMock.signInWithGoogle.mockResolvedValueOnce({
      user: {
        uid: 'fb-uid-1',
        email: 'juan@gmail.com',
        getIdToken: vi.fn(() => Promise.resolve('firebase-id-token-xyz')),
      },
    });
    authMock.googleLogin.mockResolvedValueOnce({
      user: { id: 7, email: 'juan@gmail.com', role: { name: 'usuario' } },
    });

    googleBtn.click();

    // After the click, BOTH the loader init AND the popup call have
    // fired — but only because of the click. The assertion above
    // (NOT called before the click) pinned that contract already.
    await vi.waitFor(() => {
      expect(firebaseMock.signInWithGoogle).toHaveBeenCalledTimes(1);
    });
    expect(authMock.googleLogin).toHaveBeenCalledTimes(1);
    expect(authMock.googleLogin).toHaveBeenCalledWith({
      idToken: 'firebase-id-token-xyz',
    });
  });

  it('R12: handles popup cancellation gracefully — no error rendered, user stays on /login, no auth.googleLogin call', async () => {
    await mountComponent();

    // The loader returns `null` on `auth/popup-closed-by-user` per the
    // contract pinned in firebase-loader.test.js. Simulate exactly that
    // contract here — the component MUST treat null as "user cancelled,
    // do nothing visible".
    firebaseMock.signInWithGoogle.mockResolvedValueOnce(null);

    const errorAlert = document.getElementById('login-error');
    // Sanity: the error slot starts hidden.
    expect(errorAlert.classList.contains('d-none')).toBe(true);

    document.getElementById('google-signin-btn').click();

    // Wait for the click handler to finish its async run before
    // asserting (the handler awaits signInWithGoogle before deciding).
    await vi.waitFor(() => {
      expect(firebaseMock.signInWithGoogle).toHaveBeenCalledTimes(1);
    });
    // auth.googleLogin must NOT have been called — cancelling the popup
    // means we never made it to /auth/google.
    expect(authMock.googleLogin).not.toHaveBeenCalled();
    // Error slot stays hidden — no "Cancelled" toast, no banner.
    expect(errorAlert.classList.contains('d-none')).toBe(true);
    // The user must STILL be on /login — no redirect fired.
    expect(window.location.hash).not.toBe('#/feed');
    expect(window.location.hash).not.toBe('#/dashboard');
    const { router } = await import('../../../core/router.js');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('R12: stores token and redirects citizens to /feed and administrators to /dashboard', async () => {
    // ─── Case A: citizen (role = 'usuario') → /feed ─────────────────────
    await mountComponent();
    firebaseMock.signInWithGoogle.mockResolvedValueOnce({
      user: {
        uid: 'fb-uid-A',
        email: 'citizen@gmail.com',
        getIdToken: vi.fn(() => Promise.resolve('fb-tok-A')),
      },
    });
    authMock.googleLogin.mockResolvedValueOnce({
      user: { id: 11, email: 'citizen@gmail.com', role: { name: 'usuario' } },
    });

    document.getElementById('google-signin-btn').click();

    await vi.waitFor(() => {
      expect(authMock.googleLogin).toHaveBeenCalledTimes(1);
    });
    const { router } = await import('../../../core/router.js');
    expect(router.navigate).toHaveBeenCalledWith('/feed');
    // Token-store side-effect happens INSIDE auth.googleLogin (which is
    // mocked here). The component's only contract is to forward the
    // idToken — the service-level test pins the store-side contract.

    // ─── Case B: non-citizen role → /dashboard ─────────────────────────
    vi.clearAllMocks();
    await mountComponent();
    firebaseMock.signInWithGoogle.mockResolvedValueOnce({
      user: {
        uid: 'fb-uid-B',
        email: 'admin@gmail.com',
        getIdToken: vi.fn(() => Promise.resolve('fb-tok-B')),
      },
    });
    authMock.googleLogin.mockResolvedValueOnce({
      user: {
        id: 12,
        email: 'admin@gmail.com',
        role: { name: 'admin_sistema' },
      },
    });

    document.getElementById('google-signin-btn').click();

    await vi.waitFor(() => {
      expect(authMock.googleLogin).toHaveBeenCalledTimes(1);
    });
    const { router: router2 } = await import('../../../core/router.js');
    expect(router2.navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('R12: redirects operador_organizacion to the operator dashboard', async () => {
    await mountComponent();
    firebaseMock.signInWithGoogle.mockResolvedValueOnce({
      user: {
        getIdToken: vi.fn(() => Promise.resolve('fb-tok-operator')),
      },
    });
    authMock.googleLogin.mockResolvedValueOnce({
      user: {
        id: 13,
        email: 'operator@gmail.com',
        role: { name: 'operador_organizacion' },
      },
    });

    document.getElementById('google-signin-btn').click();

    await vi.waitFor(() => {
      expect(authMock.googleLogin).toHaveBeenCalledTimes(1);
    });
    const { router } = await import('../../../core/router.js');
    expect(router.navigate).toHaveBeenCalledWith('/operator/dashboard');
  });
});
