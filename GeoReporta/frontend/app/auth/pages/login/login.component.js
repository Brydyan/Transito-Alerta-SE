/**
 * Login Component — lógica del formulario de inicio de sesión.
 *
 * R11 (frontend registration form): el mismo componente maneja los dos
 * modos (`login` y `register`) vía un toggle adyacente al título. El modo
 * por defecto es `login`, idéntico al comportamiento previo a R11. El
 * cambio de modo sólo afecta visibilidad + estado interno; la ruta `/login`
 * sigue siendo la misma, sin tocar la tabla de rutas del router.
 *
 * Reglas de UX (decisión de producto bloqueada en #2300):
 *   - Tras un 201, NO se redirige a otro lugar: se muestra el banner
 *     "Cuenta creada, iniciá sesión" y se vuelve al modo `login` para que
 *     el usuario tipee sus credenciales inmediatamente.
 *   - El método `auth.register()` no emite sesión: ningún token se guarda
 *     en sessionStorage (verificado por auth.service.register.test.js).
 *   - La validación cliente espeja las reglas del backend: ≥8 chars, ≥1
 *     mayúscula, ≥1 minúscula, ≥1 dígito, y `password === password_confirmation`.
 */
import template from './login.component.html?raw';
import style from './login.component.css?raw';
import { auth } from '../../auth.service.js';
import { router } from '../../../core/router.js';
import { classifyRole } from '../../../app-shell/app-shell.component.js';
import { maskPhoneInput } from '../../../utils/ui.js';
import { EMAIL_RE } from '../../../utils/format.js';
import { homeRouteForUser } from '../../../utils/role.js';
import { mountPasswordStrengthMeter } from '../../../shared/password-strength-meter.js';

const REGISTER_FORM_ID = 'register-form';

/**
 * Pure validator for the registration payload. Exported so unit tests
 * can exercise it directly; the component consumes the returned map to
 * render field-level errors. Returns an empty object when the payload is
 * valid. Mirrors backend RegisterRequest rules (R1–R4).
 *
 * @param {{ first_name?: string, last_name?: string, email?: string,
 *           password?: string, password_confirmation?: string }} payload
 * @returns {Record<string, string>}
 */
export function validateRegisterPayload(payload) {
  const errors = {};
  if (!payload.first_name || !payload.first_name.trim()) {
    errors.first_name = 'El nombre es obligatorio.';
  }
  if (!payload.last_name || !payload.last_name.trim()) {
    errors.last_name = 'El apellido es obligatorio.';
  }
  if (!payload.email || !payload.email.trim()) {
    errors.email = 'El correo es obligatorio.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
    errors.email = 'Ingresá un correo válido.';
  }

  const password = payload.password || '';
  if (password.length < 8) {
    errors.password = 'La contraseña debe tener al menos 8 caracteres.';
  } else if (
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    errors.password =
      'La contraseña debe contener: mayúscula (A-Z), minúscula (a-z) y dígito (0-9).';
  }

  if (
    !payload.password_confirmation ||
    payload.password !== payload.password_confirmation
  ) {
    errors.password_confirmation = 'Las contraseñas no coinciden.';
  }

  return errors;
}

// Module-level handle for the password strength meter. Lives outside
// the exported object so both onInit (mount) and onDestroy (teardown)
// can reach it — they are separate closure scopes on the literal
// export object. Without this, every navigation away + back would
// leak an extra pair of input listeners (CodeRabbit review: the same
// pattern as in accept-invite.component.js).
let _passwordMeter = null;

export default {
  template,
  style,

  onInit(ctx) {
    // Ocultar preloader (vanilla, nada de jQuery)
    const preloader = document.querySelector('.preloader');
    if (preloader) {
      preloader.style.display = 'none';
    }

    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorAlert = document.getElementById('login-error');
    const submitBtn = form.querySelector('button[type="submit"]');

    function showEmailError(inputEl, errorEl) {
      if (!inputEl.value.trim() || !EMAIL_RE.test(inputEl.value.trim())) {
        if (errorEl) {
          errorEl.textContent = 'Ingresá un correo válido.';
          errorEl.classList.remove('d-none');
        }
      }
    }

    function clearEmailError(errorEl) {
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('d-none');
      }
    }

    // ─── R11: mode toggle + register form wiring ──────────────────────
    const container = document.querySelector('.gr-login');
    const registerForm = document.getElementById(REGISTER_FORM_ID);
    const registerBanner = document.getElementById('register-banner');

    document
      .querySelectorAll('#register-form input[type="tel"]')
      .forEach((el) => {
        maskPhoneInput(el);
      });

    /** Switch between 'login' and 'register' modes. */
    const setMode = (newMode) => {
      container.setAttribute('data-mode', newMode);
      form.classList.toggle('d-none', newMode !== 'login');
      if (registerForm) {
        registerForm.classList.toggle('d-none', newMode !== 'register');
      }
      document.querySelectorAll('[data-mode-btn]').forEach((btn) => {
        const isActive = btn.dataset.modeBtn === newMode;
        btn.classList.toggle('gr-login__mode-btn--active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      // Reset transient state when switching modes.
      errorAlert.classList.add('d-none');
      this._clearFieldErrors();
      // The banner is a separate concern (post-201 success); the
      // toggle-button click handler hides it explicitly so a fresh
      // user-driven mode switch clears it without the post-201 path
      // getting clobbered.
    };

    /** Hide the post-201 banner. Called on explicit user-driven mode
     *  switches and login submissions so it doesn't linger into the
     *  next interaction. */
    const hideBanner = () => registerBanner.classList.add('d-none');

    // Wire toggle buttons.
    document.querySelectorAll('[data-mode-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setMode(btn.dataset.modeBtn);
        // Toggling mode is a user-initiated action: clear the banner
        // so a fresh registration event has the spotlight.
        hideBanner();
      });
    });

    // If the URL carries ?registered=1, switch to login mode with the
    // banner visible — supports "you clicked an emailed magic link and
    // landed here" flows. Banner is hidden on every other mode switch.
    if (ctx?.query?.get('registered') === '1') {
      setMode('login');
      registerBanner.classList.remove('d-none');
    }

    const loginEmailError = document.querySelector(
      '#login-form [data-error-for="email"]',
    );
    emailInput.addEventListener('blur', () => {
      if (emailInput.value.trim() && !EMAIL_RE.test(emailInput.value.trim())) {
        showEmailError(emailInput, loginEmailError);
      }
    });
    emailInput.addEventListener('input', () => {
      if (!emailInput.value.trim() || EMAIL_RE.test(emailInput.value.trim())) {
        clearEmailError(loginEmailError);
      }
    });

    if (registerForm) {
      const registerEmailInput = registerForm.querySelector('#register-email');
      const registerEmailError = document.querySelector(
        '#register-form [data-error-for="email"]',
      );

      registerEmailInput.addEventListener('blur', () => {
        if (
          registerEmailInput.value.trim() &&
          !EMAIL_RE.test(registerEmailInput.value.trim())
        ) {
          showEmailError(registerEmailInput, registerEmailError);
        }
      });
      registerEmailInput.addEventListener('input', () => {
        if (
          !registerEmailInput.value.trim() ||
          EMAIL_RE.test(registerEmailInput.value.trim())
        ) {
          clearEmailError(registerEmailError);
        }
      });

      const regPhoneEl = registerForm.querySelector('#phone');
      if (regPhoneEl) {
        maskPhoneInput(regPhoneEl);
      }

      registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        this._handleRegisterSubmit(registerForm, registerBanner, setMode);
      });
    }

    // ─── R12: Google sign-in button wiring ─────────────────────────────
    // The button is a sibling of both forms, not inside either one. The
    // click handler's very first side effect IS the lazy-load (a
    // dynamic `import()` of firebase-loader.js) — exactly matching the
    // R12 contract: "the SDK loads on user interaction, not on page load".
    const googleBtn = document.getElementById('google-signin-btn');
    if (googleBtn) {
      googleBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        await this._handleGoogleSignIn(googleBtn, errorAlert);
      });
    }

    // ─── Toggle password visibility (eye icon) ──────────────────────────
    document.querySelectorAll('.gr-input-eye').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = btn.previousElementSibling;
        if (input?.type === 'password') {
          input.type = 'text';
          btn.querySelector('i').className = 'fa-regular fa-eye-slash';
          btn.setAttribute('aria-label', 'Ocultar contraseña');
        } else if (input) {
          input.type = 'password';
          btn.querySelector('i').className = 'fa-regular fa-eye';
          btn.setAttribute('aria-label', 'Mostrar contraseña');
        }
      });
    });

    // ─── sc-143: shared password strength meter + rules checklist ──────
    //
    // Only register mode has password + confirmation fields, so this
    // is the only place that needs it. The mount function tolerates
    // missing DOM (e.g. if register form markup is absent), so it's
    // safe to call unconditionally.
    _passwordMeter = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('register-password'),
      confirmInput: document.getElementById('password_confirmation'),
      rulesListEl: document.querySelector(
        '[data-testid="password-rules-checklist"]',
      ),
      meterEl: document.getElementById('register-password-meter'),
      meterLabelEl: document.getElementById('register-password-meter-label'),
    });

    // ─── Forgot password link ───────────────────────────────────────────
    const forgotLink = document.querySelector('.gr-login__forgot');
    if (forgotLink) {
      forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        router.navigate('/forgot-password');
      });
      forgotLink.removeAttribute('href');
      forgotLink.style.cursor = 'pointer';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      // Resetear error
      errorAlert.classList.add('d-none');

      // Validación básica
      if (!emailInput.value.trim() || !passwordInput.value.trim()) {
        errorAlert.textContent = 'Completá todos los campos.';
        errorAlert.classList.remove('d-none');
        return;
      }

      // Estado loading
      submitBtn.disabled = true;
      submitBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Ingresando...';

      try {
        await auth.login(emailInput.value, passwordInput.value);
        // SECURITY: Always fetch /me after login to get the authoritative
        // role. The login response's `user` field lacks `role` and is for
        // UI display only.
        const user = await auth.me();
        // Classify to a router-side bucket ('citizen' | 'admin' | 'guest')
        // so the role-bucket short-circuit in router.resolve() can mount
        // the right shell without a hashchange race.
        const classifiedRole = classifyRole(user);
        // CRITICAL: set the bucket BEFORE changing the hash. The router
        // listens to hashchange and runs resolve() on the next tick;
        // if we navigate first the role-bucket check sees a stale
        // 'guest' and redirects the citizen back to /feed with no mount.
        router.setCurrentUserRole(classifiedRole);
        router.navigate(homeRouteForUser(user));
      } catch (err) {
        // Story sc-117 — 403 con `code: 'email_not_verified'`: redirigir
        // al usuario a la pantalla de verificación con un query param
        // para que el componente sepa que llegó del flujo de login.
        if (err?.status === 403 && err?.code === 'email_not_verified') {
          router.navigate(
            `/verify-email?source=login&email=${encodeURIComponent(emailInput.value.trim())}`,
          );
          return;
        }

        errorAlert.textContent =
          err.message || 'Error al iniciar sesión. Verificá tus credenciales.';
        errorAlert.classList.remove('d-none');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar Sesión';
      }
    });
  },

  /**
   * Read all register fields, run client-side validation, render errors,
   * and on a valid payload POST /register. On 201 → show banner + switch
   * to login mode. On 422 → mirror the field errors into the form.
   */
  _handleRegisterSubmit(registerForm, registerBanner, setMode) {
    const payload = {
      first_name: registerForm.querySelector('#first_name').value.trim(),
      last_name: registerForm.querySelector('#last_name').value.trim(),
      email: registerForm.querySelector('#register-email').value.trim(),
      phone: registerForm.querySelector('#phone').value.trim(),
      password: registerForm.querySelector('#register-password').value,
      password_confirmation: registerForm.querySelector(
        '#password_confirmation',
      ).value,
    };

    this._clearFieldErrors();

    const errors = validateRegisterPayload(payload);
    if (Object.keys(errors).length > 0) {
      this._renderFieldErrors(errors);
      return;
    }

    const submitBtn = registerForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Creando...';

    // Strip empty optional phone so backend receives null instead of ''.
    const wirePayload = { ...payload };
    if (!wirePayload.phone) delete wirePayload.phone;

    auth
      .register(wirePayload)
      .then((res) => {
        // Story sc-117 — 201 con `requires_verification: true` significa
        // que el correo del usuario todavía no fue verificado. Redirigimos
        // a la pantalla "Verifica tu correo" para que abra el mail
        // que le acabamos de mandar y, opcionalmente, pueda reenviarlo.
        if (res && res.requires_verification === true) {
          router.navigate(
            `/verify-email?source=register&email=${encodeURIComponent(wirePayload.email)}`,
          );
          return;
        }

        // Fallback (registro sin verificación): banner + switch to login
        // form so the user types credentials immediately.
        registerBanner.classList.remove('d-none');
        registerForm.reset();
        setMode('login');
      })
      .catch((err) => {
        if (err?.status === 422 && err.errors) {
          this._renderFieldErrors(err.errors);
        } else {
          const errorAlert = document.getElementById('login-error');
          errorAlert.textContent =
            err?.message || 'No pudimos crear tu cuenta. Intentá de nuevo.';
          errorAlert.classList.remove('d-none');
        }
      })
      .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      });
  },

  _clearFieldErrors() {
    document.querySelectorAll('[data-error-for]').forEach((el) => {
      el.textContent = '';
      el.classList.add('d-none');
    });
  },

  /**
   * R12 Google sign-in click handler.
   *
   * Sequence (per spec R12 + design #2304):
   *   1. Dynamic `import('./firebase-loader.js')` — the lazy-load IS
   *      the click handler's first side effect. The SDK is not loaded
   *      until the user clicks the Google button.
   *   2. `signInWithGoogle()` opens the Firebase popup. Returns the
   *      UserCredential on success; null on `auth/popup-closed-by-user`
   *      (spec contract — see firebase-loader.js).
   *   3. On null → swallow silently, stay on /login, no error banner.
   *   4. On credential → fetch the Firebase ID token, hand it to
   *      `auth.googleLogin({ idToken })` (which POSTs /auth/google and
   *      stores the app-session token via http.service).
   *   5. `auth.googleLogin` resolves with `{ user }` from /me — branch
   *      on `role.name` and navigate to /feed (usuario) or /dashboard.
   *   6. On any other error → render err.message into #login-error.
   */
  async _handleGoogleSignIn(googleBtn, errorAlert) {
    errorAlert.classList.add('d-none');

    googleBtn.disabled = true;
    const originalLabel = googleBtn.innerHTML;
    googleBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Conectando...';

    try {
      // Step 1: dynamic import — the lazy-load. In tests, vi.mock
      // substitutes this URL with a fake module before this resolves.
      const { signInWithGoogle } = await import('../../firebase-loader.js');

      // Step 2: open the popup. Returns null when the user cancels.
      const credential = await signInWithGoogle();
      if (!credential) {
        // Step 3: cancelled — swallow silently. Spec R12 mandates no
        // error UI; the user stays on /login.
        return;
      }

      // Step 4: forward the Firebase ID token to the backend.
      const idToken = await credential.user.getIdToken();
      const { user } = await auth.googleLogin({ idToken });

      router.setCurrentUserRole(classifyRole(user));
      router.navigate(homeRouteForUser(user));
    } catch (err) {
      // Step 6: any non-cancel error — surface the backend's spec copy
      // (either "Token de Google inválido" or "Esta cuenta ya existe,
      // iniciá sesión con tu contraseña") into the existing error slot.
      errorAlert.textContent =
        err?.message ||
        'No pudimos iniciar sesión con Google. Intentá de nuevo.';
      errorAlert.classList.remove('d-none');
    } finally {
      googleBtn.disabled = false;
      googleBtn.innerHTML = originalLabel;
    }
  },

  _renderFieldErrors(errors) {
    Object.entries(errors).forEach(([field, messages]) => {
      const errorEl = document.querySelector(`[data-error-for="${field}"]`);
      if (!errorEl) return;
      const message = Array.isArray(messages) ? messages.join(' ') : messages;
      errorEl.textContent = message;
      errorEl.classList.remove('d-none');
    });
  },

  onDestroy() {
    // Tear down the password strength meter. Captured into the
    // module-level `_passwordMeter` in onInit because onInit and
    // onDestroy are separate closure scopes on the literal export.
    if (_passwordMeter) {
      _passwordMeter.destroy();
      _passwordMeter = null;
    }
  },
};
