/**
 * password-rules.js — pure password-rule helpers (sc-130 / sc-143).
 *
 * Shared between `/accept-invite` (InvitationAcceptRequest) and
 * `/login` register mode (RegisterRequest). Both backend requests
 * enforce the same rules:
 *
 *   - minLength: password length >= 8
 *   - hasUpper:  at least one A-Z
 *   - hasLower:  at least one a-z
 *   - hasDigit:  at least one 0-9
 *   - matches:   password_confirmation has a value AND equals password
 *
 * The functions below are pure and side-effect-free; the DOM
 * wiring happens in `password-strength-meter.js`. The strength
 * score (0..4) is mirrored 1-to-1 from the production
 * `scorePassword` (it is not a backend rule — it's a UX feedback
 * layer), and is the source of truth for the meter tiers.
 *
 * RULE_LABELS and METER_TIERS are intentionally exported so the
 * mount function and any future consumer (e.g. settings/change
 * password page) get the same exact Spanish copy.
 */

export const RULE_LABELS = {
  minLength: 'Mínimo 8 caracteres',
  hasUpper: 'Una mayúscula (A-Z)',
  hasLower: 'Una minúscula (a-z)',
  hasDigit: 'Un dígito (0-9)',
  matches: 'Las contraseñas coinciden',
};

export const METER_TIERS = ['—', 'Débil', 'Aceptable', 'Buena', 'Fuerte'];

/**
 * Live password-rule snapshot — used by the "rules checklist" UI as
 * the user types. Returns a plain object of booleans; the component
 * renders each row as ok/failing. This is a UX feedback layer only:
 * the backend regex stays the source of truth on submit.
 *
 * Matches the contract of `RegisterRequest` and
 * `InvitationAcceptRequest` exactly (including the "confirm empty
 * means matches is false" rule — we don't tell the user "no
 * coinciden" before they've typed anything in the confirm field).
 *
 * @param {{ password?: string, passwordConfirmation?: string }} payload
 * @returns {{
 *   minLength: boolean,
 *   hasUpper: boolean,
 *   hasLower: boolean,
 *   hasDigit: boolean,
 *   matches: boolean,
 * }}
 */
export function livePasswordRules({ password, passwordConfirmation } = {}) {
  const pw = password || '';
  const confirmation = passwordConfirmation;

  return {
    minLength: pw.length >= 8,
    hasUpper: /[A-Z]/.test(pw),
    hasLower: /[a-z]/.test(pw),
    hasDigit: /[0-9]/.test(pw),
    matches:
      typeof confirmation === 'string' &&
      confirmation.length > 0 &&
      confirmation === pw,
  };
}

/**
 * Password strength score (0..4) for the strength meter. UX
 * feedback only — the backend is the source of truth on submit.
 *
 *   0 = empty / no input
 *   1 = meets minimum length only (>=8 chars)
 *   2 = meets 2 of {upper, lower, digit} character classes
 *   3 = meets all 3 character classes (and length >= 8 implicitly)
 *   4 = length >= 12 AND all 3 character classes
 *
 * @param {string} password
 * @returns {0 | 1 | 2 | 3 | 4}
 */
export function scorePassword(password) {
  const pw = password || '';
  if (pw.length === 0) return 0;

  const classes =
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[a-z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0);

  // Minimum length is a hard floor: a 3-char password with all three
  // character classes ("Aa1") is NOT a strong password — the backend
  // rejects it for failing minLength. The meter mirrors that: a
  // positive score requires >= 8 chars.
  if (pw.length >= 12 && classes === 3) return 4;
  if (pw.length >= 8 && classes === 3) return 3;
  if (pw.length >= 8 && classes >= 2) return 2;
  if (pw.length >= 8) return 1;
  return 0;
}
