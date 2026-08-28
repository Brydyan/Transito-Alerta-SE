/**
 * Verify-email landing page — story sc-117.
 *
 * Flujo OTP: el usuario ingresa su correo y el código OTP de 6 dígitos
 * recibido en su casilla (POST /api/email/verify-otp).
 *
 * UX: seis celdas contiguas reemplazan al input único. Autoadvance al
 * tipear, backspace retrocede, flechas izq/der navegan, pegado de un
 * código completo lo distribuye entre las seis. Cuando las 6 celdas
 * están completas, el foco salta al botón "Verificar". Si el backend
 * rechaza el código (422/403), las seis celdas se sacuden brevemente y
 * se limpian después de 1.2s para no contaminar el próximo intento.
 *
 * Endurecido: prefers-reduced-motion desactiva el shake y las
 * transiciones de borde; font-size >=16px en celdas para evitar
 * auto-zoom iOS; tap targets >=44px garantizados por la altura de
 * celda (56px mobile, 64px desktop).
 */
import template from './verify-email.component.html?raw';
import style from '../login/login.component.css?raw';
import { http } from '../../../core/http.service.js';
import { router } from '../../../core/router.js';

const RESEND_COOLDOWN_SECONDS = 60;
const OTP_LENGTH = 6;
const ERROR_CLEAR_MS = 1200;

export default {
  template,
  style,

  async onInit({ query } = {}) {
    const emailInput = document.getElementById('otp-email');
    const cells = Array.from(document.querySelectorAll('.gr-otp__cell'));
    const cellsContainer = cells[0]?.parentElement;
    const formOtp = document.getElementById('form-otp');
    const btnVerificar = document.getElementById('btn-verificar');
    const btnVerificarTexto = document.getElementById('btn-verificar-texto');
    const btnVerificarLoading = document.getElementById(
      'btn-verificar-loading',
    );

    const btnResend = document.getElementById('btn-reenviar');
    const btnText = document.getElementById('btn-texto');
    const btnLoading = document.getElementById('btn-loading');
    const btnCountdown = document.getElementById('btn-countdown');

    const initialEmail = query?.get('email') || '';
    if (emailInput && initialEmail) {
      emailInput.value = initialEmail;
    }

    const hideAllStates = () => {
      document.getElementById('estado-exito')?.classList.add('d-none');
      document.getElementById('estado-error')?.classList.add('d-none');
      document.getElementById('estado-reenvio')?.classList.add('d-none');
    };

    const showSuccess = (msg) => {
      hideAllStates();
      const txt = document.getElementById('exito-texto');
      if (txt && msg) txt.textContent = msg;
      document.getElementById('estado-exito')?.classList.remove('d-none');
    };

    const showError = (msg) => {
      hideAllStates();
      const txt = document.getElementById('error-texto');
      if (txt && msg) txt.textContent = msg;
      document.getElementById('estado-error')?.classList.remove('d-none');
    };

    // ─── OTP cell behavior ────────────────────────────────────────────
    const readOtp = () => cells.map((c) => c.value).join('');

    const clearErrorState = () => {
      cells.forEach((c) => c.classList.remove('gr-otp__cell--error'));
    };

    const setErrorState = () => {
      cells.forEach((c) => c.classList.add('gr-otp__cell--error'));
    };

    const markIncompleteCells = () => {
      cells.forEach((c) => {
        if (!c.value) c.classList.add('gr-otp__cell--error');
      });
    };

    const shakeCells = () => {
      if (!cellsContainer) return;
      // Force reflow so the animation can replay if it just played.
      cellsContainer.classList.remove('gr-otp__cells--shake');
      void cellsContainer.offsetWidth;
      cellsContainer.classList.add('gr-otp__cells--shake');
    };

    let errorClearTimer = null;
    const flashBackendError = () => {
      setErrorState();
      shakeCells();
      if (errorClearTimer) clearTimeout(errorClearTimer);
      errorClearTimer = setTimeout(() => {
        clearErrorState();
        errorClearTimer = null;
      }, ERROR_CLEAR_MS);
    };

    const distributePastedCode = (text) => {
      const digits = (text || '')
        .replace(/\D/g, '')
        .slice(0, OTP_LENGTH)
        .split('');
      if (digits.length === 0) return 0;
      cells.forEach((c, i) => {
        c.value = digits[i] || '';
      });
      return digits.length;
    };

    const focusNextEmptyAfter = (startIdx) => {
      for (let i = startIdx; i < cells.length; i += 1) {
        if (!cells[i].value) {
          cells[i].focus();
          return;
        }
      }
      btnVerificar?.focus();
    };

    cells.forEach((cell, idx) => {
      cell.addEventListener('input', (e) => {
        const raw = (e.target.value || '').replace(/\D/g, '');
        e.target.value = raw.slice(-1);
        // Re-typing clears error state on this cell and aborts the
        // global auto-clear timer so the next submit starts clean.
        cell.classList.remove('gr-otp__cell--error');
        if (errorClearTimer) {
          clearTimeout(errorClearTimer);
          errorClearTimer = null;
          clearErrorState();
        }

        if (e.target.value && idx < cells.length - 1) {
          cells[idx + 1].focus();
          cells[idx + 1].select?.();
        }
        if (idx === cells.length - 1 && e.target.value) {
          btnVerificar?.focus();
        }
      });

      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !cell.value && idx > 0) {
          e.preventDefault();
          const prev = cells[idx - 1];
          prev.value = '';
          prev.classList.remove('gr-otp__cell--error');
          prev.focus();
        } else if (e.key === 'ArrowLeft' && idx > 0) {
          e.preventDefault();
          cells[idx - 1].focus();
          cells[idx - 1].select?.();
        } else if (e.key === 'ArrowRight' && idx < cells.length - 1) {
          e.preventDefault();
          cells[idx + 1].focus();
          cells[idx + 1].select?.();
        }
      });

      cell.addEventListener('paste', (e) => {
        const data =
          e.clipboardData?.getData('text') ||
          e.clipboardData?.getData('text/plain') ||
          '';
        if (!data) return;
        const filled = distributePastedCode(data);
        e.preventDefault();
        clearErrorState();
        if (errorClearTimer) {
          clearTimeout(errorClearTimer);
          errorClearTimer = null;
        }
        if (filled === OTP_LENGTH) {
          btnVerificar?.focus();
        } else if (filled > 0) {
          focusNextEmptyAfter(filled);
        }
      });

      cell.addEventListener('focus', () => {
        cell.select?.();
      });
    });

    // When the email arrives pre-filled from the registration flow, the
    // user is mid-task: focus the first OTP cell so the keyboard comes up.
    if (initialEmail) {
      cells[0]?.focus();
    }

    // ─── Cooldown for reenvío ─────────────────────────────────────────
    const startResendCooldown = () => {
      if (!btnResend) return;
      btnResend.disabled = true;
      btnText?.classList.add('d-none');
      btnLoading?.classList.add('d-none');
      btnCountdown?.classList.remove('d-none');

      let remaining = RESEND_COOLDOWN_SECONDS;
      const tick = () => {
        if (remaining <= 0) {
          if (btnCountdown) btnCountdown.textContent = '';
          btnCountdown?.classList.add('d-none');
          btnText?.classList.remove('d-none');
          btnResend.disabled = false;
          return;
        }
        if (btnCountdown) {
          btnCountdown.textContent = `Reenviar (${remaining}s)`;
        }
        remaining -= 1;
        setTimeout(tick, 1000);
      };
      tick();
    };

    const handleResend = async () => {
      const email = emailInput?.value?.trim() || initialEmail;
      hideAllStates();
      btnLoading?.classList.remove('d-none');
      btnText?.classList.add('d-none');
      btnCountdown?.classList.add('d-none');
      btnResend.disabled = true;

      try {
        await http.post('/email/resend', { email });
        const txt = document.getElementById('reenvio-texto');
        if (txt) {
          txt.textContent = 'Te hemos enviado un nuevo código de verificación.';
        }
        document.getElementById('estado-reenvio')?.classList.remove('d-none');
        startResendCooldown();
      } catch (err) {
        if (err?.status === 429) {
          showError(
            'Has realizado demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.',
          );
        } else {
          showError(
            err?.message ||
              'No pudimos reenviar el correo. Intentalo de nuevo.',
          );
        }
      } finally {
        btnLoading?.classList.add('d-none');
        if (!btnResend.disabled) {
          btnText?.classList.remove('d-none');
        }
      }
    };

    if (btnResend) {
      btnResend.addEventListener('click', handleResend);
    }

    // ─── Submit ───────────────────────────────────────────────────────
    if (formOtp) {
      formOtp.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput?.value?.trim();
        const otp = readOtp();
        const isComplete = otp.length === OTP_LENGTH && /^\d{6}$/.test(otp);

        // Reset previous error state before revalidating.
        clearErrorState();
        if (errorClearTimer) {
          clearTimeout(errorClearTimer);
          errorClearTimer = null;
        }
        hideAllStates();

        if (!email) {
          showError('Ingresá tu correo electrónico.');
          return;
        }
        if (!isComplete) {
          markIncompleteCells();
          showError('Ingresá los 6 dígitos del código.');
          return;
        }

        btnVerificar.disabled = true;
        btnVerificarTexto?.classList.add('d-none');
        btnVerificarLoading?.classList.remove('d-none');

        try {
          const data = await http.post('/email/verify-otp', { email, otp });
          showSuccess(
            data?.message || 'Tu correo fue verificado correctamente.',
          );
          setTimeout(() => router.navigate('/login'), 2500);
        } catch (err) {
          // 422 (otp_invalid) and 403 (user_not_found) both mean the
          // code is bad — flash the shake on the cells. Other errors
          // (network/500) only show the banner, no shake.
          if (err?.status === 422 || err?.status === 403) {
            flashBackendError();
          }
          showError(err?.message || 'El código OTP es inválido o ha expirado.');
        } finally {
          btnVerificar.disabled = false;
          btnVerificarTexto?.classList.remove('d-none');
          btnVerificarLoading?.classList.add('d-none');
        }
      });
    }
  },

  onDestroy() {},
};
