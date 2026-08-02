/**
 * invitation.service.js — WU-4: invitation acceptance service.
 *
 * Spec: R-INV-11, R-INV-14, sc-130.
 *
 * Endpoints:
 *   POST /api/invitations/{token}/accept
 *     body: { password, password_confirmation, accept_terms, terms_version }
 *     200 {message: "Cuenta activada"}
 *     404 → InvitationNotFoundError
 *     410 → InvitationGoneError
 *     422 → propagates HTTP errors (caller handles field errors)
 *
 *   GET /api/invitations/{token}/preview (sc-130 / issue #109)
 *     200 → InvitationPreview payload (status: 'pending')
 *     404 → InvitationNotFoundError
 *     410 → InvitationGoneError
 *     network/other → console.warn + returns null (graceful fallback)
 *
 * NOTE (sc-143): the password-rule helpers (`livePasswordRules`,
 * `scorePassword`, `RULE_LABELS`, `METER_TIERS`) were extracted to
 * `frontend/app/shared/password-rules.js` so they can be shared with
 * the `/login` register flow (RegisterRequest and InvitationAcceptRequest
 * enforce the same rules). The DOM wiring lives in
 * `frontend/app/shared/password-strength-meter.js`.
 */
import { http } from '../core/http.service.js';

/**
 * Custom error classes so callers can distinguish 404 vs 410.
 * The http service propagates non-2xx responses as thrown Error objects
 * with err.status attached. We wrap them here for typed clarity.
 */
export class InvitationNotFoundError extends Error {
  constructor(message = 'Invitación inválida') {
    super(message);
    this.name = 'InvitationNotFoundError';
  }
}

export class InvitationGoneError extends Error {
  constructor(message = 'Esta invitación ya fue usada o expiró') {
    super(message);
    this.name = 'InvitationGoneError';
  }
}

/**
 * Validates the invitation-acceptance payload on the client side,
 * mirroring InvitationAcceptRequest rules. `livePasswordRules` and
 * `scorePassword` used to live here too; they moved to
 * `shared/password-rules.js` in sc-143 so both flows can share them.
 *
 * @param {{ password?: string, passwordConfirmation?: string, acceptTerms?: boolean }} payload
 * @returns {Record<string, string>}  empty if valid, keyed by field if invalid
 */
export function validateAcceptPayload(payload) {
  const errors = {};

  const pw = payload.password || '';
  if (pw.length < 8) {
    errors.password = 'La contraseña debe tener al menos 8 caracteres.';
  } else if (!/[A-Z]/.test(pw)) {
    errors.password = 'La contraseña debe incluir al menos una mayúscula.';
  } else if (!/[a-z]/.test(pw)) {
    errors.password = 'La contraseña debe incluir al menos una minúscula.';
  } else if (!/[0-9]/.test(pw)) {
    errors.password = 'La contraseña debe incluir al menos un dígito.';
  }

  if (!payload.passwordConfirmation || payload.passwordConfirmation !== pw) {
    errors.passwordConfirmation =
      errors.passwordConfirmation || 'Las contraseñas no coinciden.';
  }

  if (payload.acceptTerms !== true) {
    errors.acceptTerms = 'Debés aceptar los términos y condiciones.';
  }

  return errors;
}

/**
 * Accept an invitation with the given plaintext token, setting the user's
 * password and marking T&C as accepted.
 *
 * Does NOT store any JWT — the endpoint returns 200 with a plain message.
 * The caller is responsible for redirecting to /login.
 *
 * @param {string} tokenPlain    — the raw token from the URL (?token=...)
 * @param {string} password      — the new password to set
 * @param {string} confirmPassword — password confirmation (mirrors backend confirmed rule)
 * @param {boolean} acceptTerms  — must be true
 * @param {string} [termsVersion='v0'] — terms version to record
 * @returns {Promise<{message: string}>}
 * @throws {InvitationNotFoundError} on 404
 * @throws {InvitationGoneError}     on 410
 * @throws {Error}                   on other HTTP errors (status attached)
 */
export async function acceptInvitation(
  tokenPlain,
  password,
  confirmPassword,
  acceptTerms,
  termsVersion = 'v0',
) {
  let response;
  try {
    response = await http.post('/invitations/accept', {
      token: tokenPlain,
      password,
      password_confirmation: confirmPassword,
      accept_terms: acceptTerms === true,
      terms_version: termsVersion,
    });
  } catch (err) {
    if (err.status === 404) {
      throw new InvitationNotFoundError();
    }
    if (err.status === 410) {
      throw new InvitationGoneError();
    }
    throw err;
  }
  return response;
}

/**
 * Read-only preview of an invitation's metadata. Does NOT consume the
 * token — the same token can still be passed to `acceptInvitation()`.
 *
 * Semantics:
 *   200 → returns the preview payload (organisation, inviter, role,
 *         issued/expires timestamps, terms version). Never contains
 *         PII: no email, no phone, no token material, no internal ids.
 *   404 → throws InvitationNotFoundError (token unknown)
 *   410 → throws InvitationGoneError (token expired or consumed)
 *   network or unexpected → console.warn + returns null
 *     The caller is expected to fall back gracefully: the form must
 *     remain usable even if the preview request failed (offline,
 *     transient CORS issue, etc.). Showing the activation form is
 *     always safer than blocking on a metadata fetch.
 *
 * @param {string} tokenPlain — raw token from the URL
 * @returns {Promise<object|null>} preview payload, or null on network/unexpected
 * @throws {InvitationNotFoundError}
 * @throws {InvitationGoneError}
 */
export async function previewInvitation(tokenPlain) {
  try {
    return await http.get(
      `/invitations/${encodeURIComponent(tokenPlain)}/preview`,
    );
  } catch (err) {
    if (err.status === 404) {
      throw new InvitationNotFoundError();
    }
    if (err.status === 410) {
      throw new InvitationGoneError();
    }
    // Graceful degradation — never block the form on a metadata fetch.
    console.warn(
      '[invitation] preview request failed; continuing without context',
      err,
    );
    return null;
  }
}
