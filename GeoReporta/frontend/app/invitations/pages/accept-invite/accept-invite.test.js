/**
 * accept-invite.test.js — WU-4 + sc-130: invitation acceptance page.
 *
 * Spec scenarios:
 *   R-INV-11: Form visible at /accept-invite?token=...
 *   R-INV-11: Without token → error state + form disabled
 *   R-INV-11: Submit with invalid payload → no network call + field errors
 *   R-INV-14: Submit with valid payload → calls acceptInvitation
 *   R-INV-14: 200 → success banner with explicit 'Ir a iniciar sesión' CTA
 *   R-INV-14: 410 → shows "invitación expirada" message
 *   R-INV-14: 404 → shows "invitación inválida" message
 *   R-INV-14: 422 → shows field errors
 *   sc-130: preview loading skeleton → card swap on 200
 *   sc-130: preview 410 → status banner + form disabled
 *   sc-130: preview 404 → status banner + form disabled
 *   sc-130: preview network fallback → form remains usable, no crash
 *   sc-130: live password rules update on input
 *   sc-130: strength meter renders correct segments for known inputs
 *   sc-130: countdown ticker (fake timers + advance)
 *   sc-130: show-password toggle swaps input.type + icon + aria
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_HTML = readFileSync(
  resolve(__dirname, 'accept-invite.component.html'),
  'utf8',
);

// ─── Mocks ──────────────────────────────────────────────────────────────

const invitationSvcMock = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  validateAcceptPayload: vi.fn(),
  previewInvitation: vi.fn(),
  InvitationGoneError: class InvitationGoneError extends Error {
    constructor() {
      super('Esta invitación ya fue usada o expiró');
      this.name = 'InvitationGoneError';
    }
  },
  InvitationNotFoundError: class InvitationNotFoundError extends Error {
    constructor() {
      super('Invitación inválida');
      this.name = 'InvitationNotFoundError';
    }
  },
}));

// auth.acceptInvitation must be async so the component's `await` resolves.
const authSvcMock = vi.hoisted(() => ({
  acceptInvitation: vi.fn(async () => {
    return { message: 'Cuenta activada' };
  }),
}));

const routerNavigateMock = vi.hoisted(() => vi.fn());

// Shared helper mock: rule-flip / meter logic lives in the shared
// module (covered by its own test). Here we only verify that the
// component hands the correct DOM elements to the mount function.
const strengthMeterMock = vi.hoisted(() => ({
  mountPasswordStrengthMeter: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('../../invitation.service.js', () => ({
  invitationService: invitationSvcMock,
  validateAcceptPayload: invitationSvcMock.validateAcceptPayload,
  previewInvitation: invitationSvcMock.previewInvitation,
  InvitationGoneError: invitationSvcMock.InvitationGoneError,
  InvitationNotFoundError: invitationSvcMock.InvitationNotFoundError,
  acceptInvitation: invitationSvcMock.acceptInvitation,
}));

vi.mock('../../../shared/password-strength-meter.js', () => ({
  mountPasswordStrengthMeter: strengthMeterMock.mountPasswordStrengthMeter,
}));

vi.mock('../../../auth/auth.service.js', () => ({
  auth: authSvcMock,
}));

vi.mock('../../../core/router.js', () => ({
  router: { navigate: routerNavigateMock },
}));

vi.mock('../../../utils/ui.js', () => ({
  mostrarToast: vi.fn(),
}));

import { router } from '../../../core/router.js';
import acceptInviteComponent from './accept-invite.component.js';

/**
 * Mount the component into the DOM, supplying an optional URL search
 * params string (everything after the ?).
 */
async function mountComponent(search = '') {
  if (search) {
    const url = new URL('http://localhost' + search);
    Object.defineProperty(window, 'location', {
      value: url,
      writable: true,
      configurable: true,
    });
  } else {
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });
  }
  document.body.innerHTML = TEMPLATE_HTML;
  await acceptInviteComponent.onInit();
  return document.body;
}

/**
 * Helper: a fake preview payload for the "happy" preview case.
 */
function fakePreview(overrides = {}) {
  return {
    status: 'pending',
    organization: { name: 'GAD Santa Elena', initials: 'GS' },
    invitedBy: { name: 'Ana Pérez', role: 'admin_sistema' },
    role: 'operador',
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    termsVersion: 'v0',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mocks to their default behaviour.
  authSvcMock.acceptInvitation.mockImplementation(async () => ({
    message: 'Cuenta activada',
  }));
  invitationSvcMock.validateAcceptPayload.mockReturnValue({});
  // Default: preview resolves successfully (no failure mode).
  invitationSvcMock.previewInvitation.mockImplementation(async () =>
    fakePreview(),
  );
});

describe('accept-invite — WU-4 + sc-130', () => {
  describe('R-INV-11: form visibility and token handling', () => {
    it('renders the form when a valid token is present in URL', async () => {
      await mountComponent('/accept-invite?token=abc123');

      const form = document.getElementById('accept-invite-form');
      expect(form).not.toBeNull();
      expect(form.classList.contains('d-none')).toBe(false);
    });

    it('shows the missing-token error and disables the form when no token is in URL', async () => {
      await mountComponent('/accept-invite');

      const form = document.getElementById('accept-invite-form');
      expect(form.classList.contains('d-none')).toBe(true);

      const errorAlert = document.getElementById('accept-invite-error');
      expect(errorAlert.classList.contains('d-none')).toBe(false);
      expect(errorAlert.textContent).toMatch(/token/i);
    });
  });

  describe('R-INV-11: client-side validation before submit', () => {
    it('calls validateAcceptPayload with the current field values on submit', async () => {
      await mountComponent('/accept-invite?token=abc123');

      document.getElementById('invite-password').value = 'ValidPass1';
      document.getElementById('invite-password-confirm').value = 'ValidPass1';
      document.getElementById('invite-terms').checked = true;

      document
        .getElementById('accept-invite-form')
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );

      expect(invitationSvcMock.validateAcceptPayload).toHaveBeenCalledWith({
        password: 'ValidPass1',
        passwordConfirmation: 'ValidPass1',
        acceptTerms: true,
      });
    });

    it('does NOT call acceptInvitation when validateAcceptPayload returns errors', async () => {
      invitationSvcMock.validateAcceptPayload.mockReturnValue({
        password: 'La contraseña debe tener al menos 8 caracteres.',
      });

      await mountComponent('/accept-invite?token=abc123');

      document.getElementById('invite-password').value = 'Short1';
      document.getElementById('invite-password-confirm').value = 'Short1';
      document.getElementById('invite-terms').checked = true;

      document
        .getElementById('accept-invite-form')
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );

      expect(authSvcMock.acceptInvitation).not.toHaveBeenCalled();
    });

    it('renders field-level error messages when validateAcceptPayload returns errors', async () => {
      invitationSvcMock.validateAcceptPayload.mockReturnValue({
        password: 'La contraseña debe tener al menos 8 caracteres.',
      });

      await mountComponent('/accept-invite?token=abc123');

      document.getElementById('invite-password').value = 'Short1';
      document.getElementById('invite-password-confirm').value = 'Short1';
      document.getElementById('invite-terms').checked = true;

      document
        .getElementById('accept-invite-form')
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );

      const errorEl = document.querySelector('[data-error-for="password"]');
      expect(errorEl.classList.contains('d-none')).toBe(false);
      expect(errorEl.textContent).toMatch(/8 caracteres/i);
    });
  });

  describe('R-INV-14: network submission and response handling', () => {
    it('calls auth.acceptInvitation with the token and payload on valid submit', async () => {
      await mountComponent('/accept-invite?token=myToken456');

      document.getElementById('invite-password').value = 'ValidPass1';
      document.getElementById('invite-password-confirm').value = 'ValidPass1';
      document.getElementById('invite-terms').checked = true;

      document
        .getElementById('accept-invite-form')
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );

      await vi.waitFor(() => {
        expect(authSvcMock.acceptInvitation).toHaveBeenCalledTimes(1);
      });
      const [token, password, confirm, acceptTerms] =
        authSvcMock.acceptInvitation.mock.calls[0];
      expect(token).toBe('myToken456');
      expect(password).toBe('ValidPass1');
      expect(confirm).toBe('ValidPass1');
      expect(acceptTerms).toBe(true);
    });

    it('shows an explicit "Ir a iniciar sesión" CTA on 200 (success)', async () => {
      // No setTimeout redirect anymore — the success banner carries
      // a button the user clicks to continue.
      authSvcMock.acceptInvitation.mockImplementation(async () => ({
        message: 'Cuenta activada',
      }));

      await mountComponent('/accept-invite?token=validtoken');

      document.getElementById('invite-password').value = 'ValidPass1';
      document.getElementById('invite-password-confirm').value = 'ValidPass1';
      document.getElementById('invite-terms').checked = true;

      document
        .getElementById('accept-invite-form')
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );

      await vi.waitFor(() => {
        const cta = document.getElementById('accept-invite-success-cta');
        expect(cta).not.toBeNull();
      });

      const cta = document.getElementById('accept-invite-success-cta');
      expect(cta.textContent).toMatch(/Ir a iniciar sesión/);
      expect(cta.getAttribute('href')).toBe('/#/login?accepted=1');

      // The CTA must NOT auto-trigger router.navigate on mount —
      // the user clicks it when ready.
      expect(router.navigate).not.toHaveBeenCalled();

      // Clicking the CTA pushes the route.
      cta.click();
      expect(router.navigate).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith('/login?accepted=1');
    });

    it('shows the expired/consumed error banner on 410', async () => {
      authSvcMock.acceptInvitation.mockImplementation(async () => {
        throw new invitationSvcMock.InvitationGoneError();
      });

      await mountComponent('/accept-invite?token=expiredtoken');

      document.getElementById('invite-password').value = 'ValidPass1';
      document.getElementById('invite-password-confirm').value = 'ValidPass1';
      document.getElementById('invite-terms').checked = true;

      document
        .getElementById('accept-invite-form')
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );

      await vi.waitFor(() => {
        expect(authSvcMock.acceptInvitation).toHaveBeenCalledTimes(1);
      });

      await new Promise((r) => setTimeout(r, 10));

      const errorAlert = document.getElementById('accept-invite-error');
      expect(errorAlert.classList.contains('d-none')).toBe(false);
      expect(errorAlert.textContent).toMatch(/ya fue usada o expiró/i);
    });

    it('shows the invalid invitation error banner on 404', async () => {
      authSvcMock.acceptInvitation.mockImplementation(async () => {
        throw new invitationSvcMock.InvitationNotFoundError();
      });

      await mountComponent('/accept-invite?token=invaldtoken');

      document.getElementById('invite-password').value = 'ValidPass1';
      document.getElementById('invite-password-confirm').value = 'ValidPass1';
      document.getElementById('invite-terms').checked = true;

      document
        .getElementById('accept-invite-form')
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );

      await vi.waitFor(() => {
        expect(authSvcMock.acceptInvitation).toHaveBeenCalledTimes(1);
      });

      await new Promise((r) => setTimeout(r, 10));

      const errorAlert = document.getElementById('accept-invite-error');
      expect(errorAlert.classList.contains('d-none')).toBe(false);
      expect(errorAlert.textContent).toMatch(/inválida/i);
    });

    it('renders backend field errors on 422', async () => {
      const backendErr = new Error('Unprocessable');
      backendErr.status = 422;
      backendErr.errors = { password: ['La contraseña es demasiado débil.'] };
      authSvcMock.acceptInvitation.mockImplementation(async () => {
        throw backendErr;
      });

      await mountComponent('/accept-invite?token=anytoken');

      document.getElementById('invite-password').value = 'ValidPass1';
      document.getElementById('invite-password-confirm').value = 'ValidPass1';
      document.getElementById('invite-terms').checked = true;

      document
        .getElementById('accept-invite-form')
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );

      await vi.waitFor(() => {
        expect(authSvcMock.acceptInvitation).toHaveBeenCalledTimes(1);
      });

      await new Promise((r) => setTimeout(r, 10));

      const errorEl = document.querySelector('[data-error-for="password"]');
      expect(errorEl.classList.contains('d-none')).toBe(false);
      expect(errorEl.textContent).toMatch(/débil/i);
    });
  });

  // ─── sc-130: preview loading skeleton → loaded card ─────────────────
  describe('sc-130: preview loading skeleton swaps to context card on 200', () => {
    it('renders the skeleton on mount, then swaps to a context card on 200', async () => {
      invitationSvcMock.previewInvitation.mockImplementation(async () =>
        fakePreview(),
      );

      await mountComponent('/accept-invite?token=previewtoken');

      const heroContext = document.getElementById('invite-hero-context');
      expect(heroContext).not.toBeNull();

      // Wait for the preview promise to resolve and the swap to happen.
      await vi.waitFor(() => {
        const card = heroContext.querySelector('.gr-accept-invite__hero-card');
        expect(card).not.toBeNull();
      });

      const card = heroContext.querySelector('.gr-accept-invite__hero-card');
      expect(card.textContent).toMatch(/GAD Santa Elena/);
      expect(card.textContent).toMatch(/Ana Pérez/);

      // The countdown element exists and has the data-expires-at attr.
      const countdown = document.getElementById('invite-hero-countdown');
      expect(countdown).not.toBeNull();
      expect(countdown.getAttribute('data-expires-at')).toBeTruthy();
    });

    it('renders a status banner and disables the form on preview 410', async () => {
      invitationSvcMock.previewInvitation.mockImplementation(async () => {
        throw new invitationSvcMock.InvitationGoneError();
      });

      await mountComponent('/accept-invite?token=gone');

      await vi.waitFor(() => {
        const banner = document.querySelector('.gr-accept-invite__hero-banner');
        expect(banner).not.toBeNull();
      });

      const banner = document.querySelector('.gr-accept-invite__hero-banner');
      expect(banner.textContent).toMatch(/ya no es válida/);
      expect(banner.textContent).toMatch(/administrador/i);

      // Submitting now must be a no-op.
      const submitBtn = document.getElementById('btn-activar');
      expect(submitBtn.disabled).toBe(true);
    });

    it('renders a status banner and disables the form on preview 404', async () => {
      invitationSvcMock.previewInvitation.mockImplementation(async () => {
        throw new invitationSvcMock.InvitationNotFoundError();
      });

      await mountComponent('/accept-invite?token=missing');

      await vi.waitFor(() => {
        const banner = document.querySelector('.gr-accept-invite__hero-banner');
        expect(banner).not.toBeNull();
      });

      const banner = document.querySelector('.gr-accept-invite__hero-banner');
      expect(banner.textContent).toMatch(/no encontrada/);

      expect(document.getElementById('btn-activar').disabled).toBe(true);
    });

    it('falls back gracefully on preview network error (form remains usable)', async () => {
      invitationSvcMock.previewInvitation.mockImplementation(async () => {
        // Service contract: returns null on network/unexpected errors
        // (after console.warn). We mirror that here.
        return null;
      });

      await mountComponent('/accept-invite?token=offline');

      // Give the IIFE a tick to settle.
      await new Promise((r) => setTimeout(r, 10));

      // Hero context is cleared (no card, no banner).
      const heroContext = document.getElementById('invite-hero-context');
      expect(heroContext.innerHTML).toBe('');

      // Form is still usable: submit should reach auth.acceptInvitation.
      document.getElementById('invite-password').value = 'ValidPass1';
      document.getElementById('invite-password-confirm').value = 'ValidPass1';
      document.getElementById('invite-terms').checked = true;

      document
        .getElementById('accept-invite-form')
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );

      await vi.waitFor(() => {
        expect(authSvcMock.acceptInvitation).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ─── sc-143: shared password strength meter wiring ──────────────────
  describe('sc-143: shared password strength meter wiring', () => {
    it('mounts the shared strength meter with all expected DOM elements', async () => {
      await mountComponent('/accept-invite?token=t');

      expect(
        strengthMeterMock.mountPasswordStrengthMeter,
      ).toHaveBeenCalledTimes(1);
      const opts =
        strengthMeterMock.mountPasswordStrengthMeter.mock.calls[0][0];
      expect(opts.passwordInput).toBe(
        document.getElementById('invite-password'),
      );
      expect(opts.confirmInput).toBe(
        document.getElementById('invite-password-confirm'),
      );
      expect(opts.rulesListEl).toBe(
        document.querySelector('[data-testid="password-rules-checklist"]'),
      );
      expect(opts.meterEl).toBe(
        document.getElementById('invite-password-meter'),
      );
      expect(opts.meterLabelEl).toBe(
        document.getElementById('invite-password-meter-label'),
      );
    });

    it('renders the rules checklist + strength meter markup with the shared selectors', async () => {
      await mountComponent('/accept-invite?token=t');

      const checklist = document.querySelector(
        '[data-testid="password-rules-checklist"]',
      );
      expect(checklist).not.toBeNull();
      expect(checklist.classList.contains('gr-strength-rules')).toBe(true);

      for (const key of [
        'minLength',
        'hasUpper',
        'hasLower',
        'hasDigit',
        'matches',
      ]) {
        const row = checklist.querySelector(`[data-rule="${key}"]`);
        expect(row).not.toBeNull();
        expect(row.classList.contains('gr-strength-rule')).toBe(true);
        expect(row.querySelector('.gr-strength-rule-icon')).not.toBeNull();
        expect(row.querySelector('.gr-strength-rule-label')).not.toBeNull();
      }

      const meter = document.getElementById('invite-password-meter');
      expect(meter).not.toBeNull();
      expect(meter.classList.contains('gr-strength-meter')).toBe(true);
      expect(meter.getAttribute('role')).toBe('meter');
      expect(meter.getAttribute('aria-valuenow')).toBe('0');
      expect(meter.querySelectorAll('.gr-strength-meter-segment').length).toBe(
        4,
      );
      expect(
        document.getElementById('invite-password-meter-label').textContent,
      ).toBe('—');
    });
  });

  // ─── sc-130: show-password toggle ────────────────────────────────────
  describe('sc-130: show-password toggle', () => {
    it('flips input.type between password and text on click, swapping the icon', async () => {
      await mountComponent('/accept-invite?token=t');

      const eyeBtn = document.querySelector(
        '.gr-input-eye[data-eye-for="invite-password"]',
      );
      const input = document.getElementById('invite-password');
      expect(input.type).toBe('password');
      expect(eyeBtn.getAttribute('aria-pressed')).toBe('false');

      eyeBtn.click();

      expect(input.type).toBe('text');
      expect(eyeBtn.getAttribute('aria-pressed')).toBe('true');
      expect(eyeBtn.getAttribute('aria-label')).toMatch(/Ocultar/);
      expect(eyeBtn.querySelector('i').className).toMatch(/eye-slash/);

      eyeBtn.click();

      expect(input.type).toBe('password');
      expect(eyeBtn.getAttribute('aria-pressed')).toBe('false');
      expect(eyeBtn.getAttribute('aria-label')).toMatch(/Mostrar/);
      expect(eyeBtn.querySelector('i').className).toMatch(/(^|\s)fa-eye($|\s)/);
    });

    it('wires the confirm-field eye button independently', async () => {
      await mountComponent('/accept-invite?token=t');

      const pwEye = document.querySelector(
        '.gr-input-eye[data-eye-for="invite-password"]',
      );
      const confirmEye = document.querySelector(
        '.gr-input-eye[data-eye-for="invite-password-confirm"]',
      );
      const pw = document.getElementById('invite-password');
      const confirm = document.getElementById('invite-password-confirm');

      confirmEye.click();

      // Confirm becomes text, password stays password.
      expect(confirm.type).toBe('text');
      expect(pw.type).toBe('password');
      // Confirm eye is pressed, password eye isn't.
      expect(confirmEye.getAttribute('aria-pressed')).toBe('true');
      expect(pwEye.getAttribute('aria-pressed')).toBe('false');
    });
  });

  // ─── sc-130: countdown ticker ────────────────────────────────────────
  describe('sc-130: countdown ticker', () => {
    it('renders Expira en N días for an expiry 2 days out and switches the text via setTimeout(60_000)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));

      const twoDaysOut = new Date('2026-07-29T12:00:00Z').toISOString();
      invitationSvcMock.previewInvitation.mockImplementation(async () =>
        fakePreview({ expiresAt: twoDaysOut }),
      );

      await mountComponent('/accept-invite?token=countdown');

      const countdown = document.getElementById('invite-hero-countdown');
      expect(countdown).not.toBeNull();
      expect(countdown.textContent).toMatch(/Expira en 2 días/);

      // Advance 1 day: the next minute-granular tick fires and the
      // label updates.
      vi.advanceTimersByTime(24 * 3600 * 1000);
      expect(countdown.textContent).toMatch(/Expira en 1 día/);

      // Advance 23 hours → below 1 hour → switches to requestAnimationFrame.
      vi.advanceTimersByTime(23 * 3600 * 1000);
      // The label granularity just changed. Trigger a frame manually.
      vi.advanceTimersByTime(60 * 1000);
      expect(countdown.textContent).toMatch(/Expira en \d+ minutos?/);

      vi.useRealTimers();
    });

    it('renders "Expirada" once the deadline passes', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));

      const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();
      invitationSvcMock.previewInvitation.mockImplementation(async () =>
        fakePreview({ expiresAt: tenSecondsAgo }),
      );

      await mountComponent('/accept-invite?token=expired-countdown');

      const countdown = document.getElementById('invite-hero-countdown');
      // After the preview resolves and the first tick runs, the
      // countdown should switch to expired state.
      await vi.waitFor(() => {
        expect(countdown.textContent).toMatch(/Expirada/);
      });
      expect(
        countdown.classList.contains(
          'gr-accept-invite__hero-card-countdown--expired',
        ),
      ).toBe(true);

      vi.useRealTimers();
    });
  });
});
