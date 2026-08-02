/**
 * password-rules.test.js — pure password-rule helper tests.
 *
 * Moved verbatim from invitation.service.test.js (sc-130) when the
 * rules were extracted into a shared module (sc-143). The contract
 * is identical to what the invitation accept form used to test, and
 * also mirrors RegisterRequest's password rules.
 */

import { describe, it, expect } from 'vitest';
import {
  livePasswordRules,
  scorePassword,
  RULE_LABELS,
  METER_TIERS,
} from './password-rules.js';

describe('livePasswordRules', () => {
  it('marks every rule as failing for an empty password', () => {
    expect(
      livePasswordRules({
        password: '',
        passwordConfirmation: '',
      }),
    ).toEqual({
      minLength: false,
      hasUpper: false,
      hasLower: false,
      hasDigit: false,
      matches: false,
    });
  });

  it('marks minLength as ok when the password is >= 8 chars', () => {
    const rules = livePasswordRules({
      password: 'longenough',
      passwordConfirmation: '',
    });
    expect(rules.minLength).toBe(true);
  });

  it('marks hasUpper / hasLower / hasDigit independently', () => {
    const all = livePasswordRules({
      password: 'Aa1aaaaa',
      passwordConfirmation: '',
    });
    expect(all.hasUpper).toBe(true);
    expect(all.hasLower).toBe(true);
    expect(all.hasDigit).toBe(true);

    const upperOnly = livePasswordRules({
      password: 'AAAAAAAA',
      passwordConfirmation: '',
    });
    expect(upperOnly.hasUpper).toBe(true);
    expect(upperOnly.hasLower).toBe(false);
    expect(upperOnly.hasDigit).toBe(false);
  });

  it('marks matches as false when the confirmation is empty, even if password is set', () => {
    const rules = livePasswordRules({
      password: 'ValidPass1',
      passwordConfirmation: '',
    });
    expect(rules.matches).toBe(false);
  });

  it('marks matches as true only when confirmation equals password', () => {
    const ok = livePasswordRules({
      password: 'ValidPass1',
      passwordConfirmation: 'ValidPass1',
    });
    expect(ok.matches).toBe(true);

    const mismatch = livePasswordRules({
      password: 'ValidPass1',
      passwordConfirmation: 'DifferentPass2',
    });
    expect(mismatch.matches).toBe(false);
  });

  it('treats missing passwordConfirmation as empty', () => {
    const rules = livePasswordRules({ password: 'ValidPass1' });
    expect(rules.matches).toBe(false);
  });

  it('treats missing payload as empty (no throw)', () => {
    expect(() => livePasswordRules()).not.toThrow();
    expect(livePasswordRules()).toEqual({
      minLength: false,
      hasUpper: false,
      hasLower: false,
      hasDigit: false,
      matches: false,
    });
  });
});

describe('scorePassword', () => {
  it('returns 0 for empty / undefined input', () => {
    expect(scorePassword('')).toBe(0);
    expect(scorePassword(undefined)).toBe(0);
    expect(scorePassword(null)).toBe(0);
  });

  it('returns 1 for length-only (>=8 chars, no class diversity)', () => {
    expect(scorePassword('aaaaaaaa')).toBe(1);
  });

  it('returns 2 when 2 character classes are present', () => {
    expect(scorePassword('aaaaaaaaA')).toBe(2);
    expect(scorePassword('aaaaaaaa1')).toBe(2);
  });

  it('returns 3 when all 3 character classes are present', () => {
    expect(scorePassword('aaaaaaaaA1')).toBe(3);
  });

  it('returns 4 for length >= 12 AND all 3 character classes', () => {
    expect(scorePassword('StrongP4ssword!!')).toBe(4);
  });

  it('returns 0 for short passwords without enough class diversity', () => {
    expect(scorePassword('Aa1')).toBe(0);
  });
});

describe('RULE_LABELS / METER_TIERS constants', () => {
  it('exposes the 5 rule labels with the Spanish copy used by the checklist', () => {
    expect(RULE_LABELS.minLength).toBe('Mínimo 8 caracteres');
    expect(RULE_LABELS.hasUpper).toBe('Una mayúscula (A-Z)');
    expect(RULE_LABELS.hasLower).toBe('Una minúscula (a-z)');
    expect(RULE_LABELS.hasDigit).toBe('Un dígito (0-9)');
    expect(RULE_LABELS.matches).toBe('Las contraseñas coinciden');
  });

  it('exposes 5 meter tiers including the empty placeholder', () => {
    expect(METER_TIERS).toEqual(['—', 'Débil', 'Aceptable', 'Buena', 'Fuerte']);
  });
});
