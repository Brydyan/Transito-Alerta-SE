import template from './forgot-password.component.html?raw';
import style from '../login/login.component.css?raw';
import { http } from '../../../core/http.service.js';

export default {
  template,
  style,

  async onInit() {
    const form = document.getElementById('forgot-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!e.target.checkValidity()) {
        e.target.classList.add('was-validated');
        return;
      }

      const emailInput = document.getElementById('email');
      const email = emailInput?.value.trim() ?? '';
      document.getElementById('btn-texto')?.classList.add('d-none');
      document.getElementById('btn-loading')?.classList.remove('d-none');
      const btnEnviar = document.getElementById('btn-enviar');
      if (btnEnviar) btnEnviar.disabled = true;
      document.getElementById('estado-error')?.classList.add('d-none');
      document.getElementById('estado-exito')?.classList.add('d-none');

      try {
        await http.post('/forgot-password', { email });
        const exitoTexto = document.getElementById('exito-texto');
        if (exitoTexto) {
          exitoTexto.textContent =
            'Te hemos enviado un enlace de restablecimiento por correo electrónico.';
        }
        document.getElementById('estado-exito')?.classList.remove('d-none');
        if (emailInput) emailInput.value = '';
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
              : 'No pudimos enviar el enlace. Intenta de nuevo en unos minutos.';
        const errorTexto = document.getElementById('error-texto');
        if (errorTexto) {
          errorTexto.textContent = msg;
        }
        document.getElementById('estado-error')?.classList.remove('d-none');
      } finally {
        document.getElementById('btn-texto')?.classList.remove('d-none');
        document.getElementById('btn-loading')?.classList.add('d-none');
        if (btnEnviar) btnEnviar.disabled = false;
      }
    });
  },

  onDestroy() {},
};
