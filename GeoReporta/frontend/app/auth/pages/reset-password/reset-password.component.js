import template from './reset-password.component.html?raw';
import style from '../login/login.component.css?raw';
import { http } from '../../../core/http.service.js';
import { router } from '../../../core/router.js';

export default {
  template,
  style,

  async onInit({ query } = {}) {
    const token = query?.get('token');
    const email = query?.get('email');

    if (!token || !email) {
      document.getElementById('estado-error')?.classList.remove('d-none');
      const errTxt = document.getElementById('error-texto');
      if (errTxt)
        errTxt.textContent =
          'Enlace inválido. Solicita un nuevo restablecimiento de contraseña.';
      const submitBtn = document
        .getElementById('reset-form')
        ?.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    // Eye toggle for password fields
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

    const resetForm = document.getElementById('reset-form');
    if (!resetForm) return;

    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!e.target.checkValidity()) {
        e.target.classList.add('was-validated');
        return;
      }

      const passwordInput = document.getElementById('password');
      const passwordConfirmInput = document.getElementById('password-confirm');
      const password = passwordInput?.value ?? '';
      const passwordConfirmation = passwordConfirmInput?.value ?? '';

      if (password !== passwordConfirmation) {
        const errTxt = document.getElementById('error-texto');
        if (errTxt) errTxt.textContent = 'Las contraseñas no coinciden.';
        document.getElementById('estado-error')?.classList.remove('d-none');
        return;
      }

      document.getElementById('btn-texto')?.classList.add('d-none');
      document.getElementById('btn-loading')?.classList.remove('d-none');
      const btnRestablecer = document.getElementById('btn-restablecer');
      if (btnRestablecer) btnRestablecer.disabled = true;
      document.getElementById('estado-error')?.classList.add('d-none');
      document.getElementById('estado-exito')?.classList.add('d-none');

      try {
        await http.post('/reset-password', {
          token,
          email,
          password,
          password_confirmation: passwordConfirmation,
        });
        document.getElementById('estado-exito')?.classList.remove('d-none');
        if (btnRestablecer) btnRestablecer.disabled = true;
        // Redirect to login after a delay
        setTimeout(() => router.navigate('/login'), 3000);
      } catch (err) {
        const isTechnicalError =
          err.message &&
          (err.message.includes('SQLSTATE') ||
            err.message.includes('Connection.php'));
        const msg =
          err.status === 429
            ? 'Demasiados intentos. Intenta de nuevo en unos minutos.'
            : err.message && !isTechnicalError
              ? err.message
              : 'No se pudo restablecer la contraseña. El enlace puede haber expirado o ser inválido.';
        const errTxt = document.getElementById('error-texto');
        if (errTxt) errTxt.textContent = msg;
        document.getElementById('estado-error')?.classList.remove('d-none');
      } finally {
        document.getElementById('btn-texto')?.classList.remove('d-none');
        document.getElementById('btn-loading')?.classList.add('d-none');
        if (btnRestablecer) btnRestablecer.disabled = false;
      }
    });
  },

  onDestroy() {},
};
