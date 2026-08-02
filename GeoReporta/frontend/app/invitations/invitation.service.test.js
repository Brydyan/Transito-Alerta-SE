/**
 * invitation.service.test.js — WU-4: invitation acceptance service layer.
 *
 * Spec contract (R-INV-11 / R-INV-14):
 *   POST /api/invitations/{token}/accept
 *     body: { password, passwordConfirmation, accept_terms: true, terms_version: 'v0' }
 *     200 → {message: "Cuenta activada"}
 *     404 → "Invitación inválida"
 *     410 → "Esta invitación ya fue usada o expiró"
 *     422 → field errors
 *
 * validateAcceptPayload mirrors backend InvitationAcceptRequest rules:
 *   - password ≥ 8 chars, at least one upper, one lower, one digit
 *   - passwordConfirmation === password
 *   - acceptTerms === true
 *
 * NOTE (sc-143): password-rule helpers moved to
 * `frontend/app/shared/password-rules.test.js`. Service layer no
 * longer exports them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../core/http.service.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    setAccessToken: mod.setAccessToken,
    clearAuthState: mod.clearAuthState,
    http: {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue(null),
    },
  };
});

import { http } from '../core/http.service.js';

describe('invitation.service — WU-4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── validateAcceptPayload ─────────────────────────────────────────────

  describe('validateAcceptPayload', () => {
    // Imported dynamically so the module can be tested without the
    // production service existing yet (RED phase).
    let validateAcceptPayload;

    beforeEach(async () => {
      const mod = await import('./invitation.service.js');
      validateAcceptPayload = mod.validateAcceptPayload;
    });

    const validPayload = {
      password: 'ValidPass1',
      passwordConfirmation: 'ValidPass1',
      acceptTerms: true,
    };

    it('returns an empty error map for a valid payload', () => {
      expect(validateAcceptPayload(validPayload)).toEqual({});
    });

    it('rejects a password shorter than 8 characters', () => {
      const errors = validateAcceptPayload({
        ...validPayload,
        password: 'Short1',
      });
      expect(errors.password).toMatch(/8 caracteres/i);
    });

    it('rejects a password without an uppercase letter', () => {
      const errors = validateAcceptPayload({
        ...validPayload,
        password: 'lowercase1',
      });
      expect(errors.password).toMatch(/mayúscula/i);
    });

    it('rejects a password without a lowercase letter', () => {
      const errors = validateAcceptPayload({
        ...validPayload,
        password: 'UPPERCASE1',
      });
      expect(errors.password).toMatch(/minúscula/i);
    });

    it('rejects a password without a digit', () => {
      const errors = validateAcceptPayload({
        ...validPayload,
        password: 'NoDigitsHere',
      });
      expect(errors.password).toMatch(/dígito/i);
    });

    it('rejects a passwordConfirmation that does not match password', () => {
      const errors = validateAcceptPayload({
        ...validPayload,
        passwordConfirmation: 'DifferentPass2',
      });
      expect(errors.passwordConfirmation).toMatch(/no coinciden/i);
    });

    it('rejects acceptTerms === false', () => {
      const errors = validateAcceptPayload({
        ...validPayload,
        acceptTerms: false,
      });
      expect(errors.acceptTerms).toMatch(/términos/i);
    });

    it('rejects acceptTerms === null', () => {
      const errors = validateAcceptPayload({
        ...validPayload,
        acceptTerms: null,
      });
      expect(errors.acceptTerms).toMatch(/términos/i);
    });

    it('rejects acceptTerms === undefined', () => {
      const errors = validateAcceptPayload({
        password: 'ValidPass1',
        passwordConfirmation: 'ValidPass1',
      });
      expect(errors.acceptTerms).toMatch(/términos/i);
    });
  });

  // ─── acceptInvitation ─────────────────────────────────────────────────

  describe('acceptInvitation', () => {
    it('POSTs to the correct endpoint path with the token', async () => {
      const { acceptInvitation } = await import('./invitation.service.js');
      http.post.mockResolvedValueOnce({ message: 'Cuenta activada' });

      await acceptInvitation(
        'myplain token',
        'ValidPass1',
        'ValidPass1',
        true,
        'v0',
      );

      expect(http.post).toHaveBeenCalledTimes(1);
      const [path, payload] = http.post.mock.calls[0];
      expect(path).toBe('/invitations/accept');
      expect(payload.token).toBe('myplain token');
    });

    it('sends the correct payload shape to the endpoint', async () => {
      const { acceptInvitation } = await import('./invitation.service.js');
      http.post.mockResolvedValueOnce({ message: 'Cuenta activada' });

      await acceptInvitation(
        'token123',
        'MyPassword1',
        'MyPassword1',
        true,
        'v0',
      );

      const [, payload] = http.post.mock.calls[0];
      expect(payload).toEqual({
        token: 'token123',
        password: 'MyPassword1',
        password_confirmation: 'MyPassword1',
        accept_terms: true,
        terms_version: 'v0',
      });
    });

    it('uses default terms_version of v0 when not provided', async () => {
      const { acceptInvitation } = await import('./invitation.service.js');
      http.post.mockResolvedValueOnce({ message: 'Cuenta activada' });

      // @ts-ignore — testing JS default parameter behaviour
      await acceptInvitation('token123', 'MyPassword1', 'MyPassword1', true);

      const [, payload] = http.post.mock.calls[0];
      expect(payload.token).toBe('token123');
      expect(payload.terms_version).toBe('v0');
    });

    it('throws InvitationGoneError on 410 response', async () => {
      const { acceptInvitation, InvitationGoneError } =
        await import('./invitation.service.js');
      const err = new Error('Token expirado');
      err.status = 410;
      http.post.mockRejectedValueOnce(err);

      await expect(
        acceptInvitation(
          'expiredtoken',
          'ValidPass1',
          'ValidPass1',
          true,
          'v0',
        ),
      ).rejects.toThrow(InvitationGoneError);
    });

    it('throws InvitationNotFoundError on 404 response', async () => {
      const { acceptInvitation, InvitationNotFoundError } =
        await import('./invitation.service.js');
      const err = new Error('Not found');
      err.status = 404;
      http.post.mockRejectedValueOnce(err);

      await expect(
        acceptInvitation('badtoken', 'ValidPass1', 'ValidPass1', true, 'v0'),
      ).rejects.toThrow(InvitationNotFoundError);
    });

    it('passes through other HTTP errors with their status code attached', async () => {
      const { acceptInvitation } = await import('./invitation.service.js');
      const err = new Error('Server error');
      err.status = 500;
      http.post.mockRejectedValueOnce(err);

      await expect(
        acceptInvitation('anytoken', 'ValidPass1', 'ValidPass1', true, 'v0'),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ─── previewInvitation — sc-130 ─────────────────────────────────────

  describe('previewInvitation', () => {
    it('GETs the preview endpoint and returns the response body', async () => {
      const { previewInvitation } = await import('./invitation.service.js');
      http.get.mockResolvedValueOnce({
        status: 'pending',
        organization: { name: 'GAD', initials: 'G' },
        invitedBy: null,
        role: 'operador',
        issuedAt: '2026-07-27T00:00:00+00:00',
        expiresAt: '2026-07-29T00:00:00+00:00',
        termsVersion: 'v0',
      });

      const result = await previewInvitation('sometoken');

      expect(http.get).toHaveBeenCalledTimes(1);
      expect(http.get).toHaveBeenCalledWith('/invitations/sometoken/preview');
      expect(result.status).toBe('pending');
    });

    it('encodes special characters in the token', async () => {
      const { previewInvitation } = await import('./invitation.service.js');
      http.get.mockResolvedValueOnce({ status: 'pending' });

      await previewInvitation('token with spaces / slash');

      expect(http.get).toHaveBeenCalledWith(
        '/invitations/token%20with%20spaces%20%2F%20slash/preview',
      );
    });

    it('throws InvitationNotFoundError on 404', async () => {
      const { previewInvitation, InvitationNotFoundError } =
        await import('./invitation.service.js');
      const err = new Error('Not found');
      err.status = 404;
      http.get.mockRejectedValueOnce(err);

      await expect(previewInvitation('unknown')).rejects.toBeInstanceOf(
        InvitationNotFoundError,
      );
    });

    it('throws InvitationGoneError on 410', async () => {
      const { previewInvitation, InvitationGoneError } =
        await import('./invitation.service.js');
      const err = new Error('Gone');
      err.status = 410;
      http.get.mockRejectedValueOnce(err);

      await expect(previewInvitation('gone')).rejects.toBeInstanceOf(
        InvitationGoneError,
      );
    });

    it('returns null + console.warn on network error (graceful fallback)', async () => {
      const { previewInvitation } = await import('./invitation.service.js');
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      http.get.mockRejectedValueOnce(new TypeError('Network down'));

      const result = await previewInvitation('anytoken');

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('returns null + console.warn on unexpected non-HTTP error', async () => {
      const { previewInvitation } = await import('./invitation.service.js');
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const err = new Error('Something blew up');
      err.status = 503;
      http.get.mockRejectedValueOnce(err);

      const result = await previewInvitation('anytoken');

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
