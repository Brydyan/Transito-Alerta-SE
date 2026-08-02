/**
 * password-strength-meter.test.js — mountPasswordStrengthMeter unit tests.
 *
 * Pattern mirrors avatar-uploader.test.js (vitest + jsdom, plain
 * `document.body.innerHTML` fixtures, no router involved). The
 * fixture covers the full markup contract (rule rows + meter) so
 * every behavior branch has a real DOM home.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountPasswordStrengthMeter } from './password-strength-meter.js';

function _buildFixtureHtml() {
  return `
    <form>
      <input id="pw" type="password" />
      <input id="confirm" type="password" />
      <ul data-testid="password-rules-checklist" aria-label="Reglas">
        <li class="gr-strength-rule" data-rule="minLength" aria-live="polite">
          <span class="gr-strength-rule-icon" aria-hidden="true"><i class="fa-solid fa-circle"></i></span>
          <span class="gr-strength-rule-label">Mínimo 8 caracteres</span>
        </li>
        <li class="gr-strength-rule" data-rule="hasUpper" aria-live="polite">
          <span class="gr-strength-rule-icon" aria-hidden="true"><i class="fa-solid fa-circle"></i></span>
          <span class="gr-strength-rule-label">Una mayúscula (A-Z)</span>
        </li>
        <li class="gr-strength-rule" data-rule="hasLower" aria-live="polite">
          <span class="gr-strength-rule-icon" aria-hidden="true"><i class="fa-solid fa-circle"></i></span>
          <span class="gr-strength-rule-label">Una minúscula (a-z)</span>
        </li>
        <li class="gr-strength-rule" data-rule="hasDigit" aria-live="polite">
          <span class="gr-strength-rule-icon" aria-hidden="true"><i class="fa-solid fa-circle"></i></span>
          <span class="gr-strength-rule-label">Un dígito (0-9)</span>
        </li>
        <li class="gr-strength-rule" data-rule="matches" aria-live="polite">
          <span class="gr-strength-rule-icon" aria-hidden="true"><i class="fa-solid fa-circle"></i></span>
          <span class="gr-strength-rule-label">Las contraseñas coinciden</span>
        </li>
      </ul>
      <div
        id="meter"
        data-testid="password-strength-meter"
        role="meter"
        aria-valuemin="0"
        aria-valuemax="4"
        aria-valuenow="0"
        aria-label="Seguridad de la contraseña"
      >
        <div class="gr-strength-meter-segments">
          <span class="gr-strength-meter-segment"></span>
          <span class="gr-strength-meter-segment"></span>
          <span class="gr-strength-meter-segment"></span>
          <span class="gr-strength-meter-segment"></span>
        </div>
        <span class="gr-strength-meter-label" id="meter-label">—</span>
      </div>
    </form>
  `;
}

function _rowFor(ruleKey) {
  return document.querySelector(`[data-rule="${ruleKey}"]`);
}

function _segmentsOn() {
  return document.querySelectorAll('.gr-strength-meter-segment--on');
}

describe('mountPasswordStrengthMeter', () => {
  beforeEach(() => {
    document.body.innerHTML = _buildFixtureHtml();
  });

  it('returns null when the password input is missing', () => {
    document.body.innerHTML = '';
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: null,
      rulesListEl: document.body,
    });
    expect(ctrl).toBeNull();
  });

  it('returns null when neither rules nor meter DOM exists', () => {
    document.body.innerHTML = '<form><input id="pw" /></form>';
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('pw'),
      rulesListEl: null,
      meterEl: null,
    });
    expect(ctrl).toBeNull();
  });

  it('runs an initial pass so the meter starts in the "—" empty state', () => {
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('pw'),
      confirmInput: document.getElementById('confirm'),
      rulesListEl: document.querySelector(
        '[data-testid="password-rules-checklist"]',
      ),
      meterEl: document.getElementById('meter'),
      meterLabelEl: document.getElementById('meter-label'),
    });

    expect(ctrl).not.toBeNull();
    expect(_segmentsOn().length).toBe(0);
    expect(document.getElementById('meter').getAttribute('aria-valuenow')).toBe(
      '0',
    );
    expect(document.getElementById('meter-label').textContent).toBe('—');
    document.querySelectorAll('.gr-strength-rule').forEach((row) => {
      expect(row.classList.contains('gr-strength-rule--ok')).toBe(false);
    });

    ctrl.destroy();
  });

  it('toggles the --ok modifier on rule rows based on the password value', () => {
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('pw'),
      confirmInput: document.getElementById('confirm'),
      rulesListEl: document.querySelector(
        '[data-testid="password-rules-checklist"]',
      ),
      meterEl: document.getElementById('meter'),
      meterLabelEl: document.getElementById('meter-label'),
    });

    const pw = document.getElementById('pw');
    pw.value = 'ValidPass1';
    pw.dispatchEvent(new Event('input', { bubbles: true }));

    expect(
      _rowFor('minLength').classList.contains('gr-strength-rule--ok'),
    ).toBe(true);
    expect(_rowFor('hasUpper').classList.contains('gr-strength-rule--ok')).toBe(
      true,
    );
    expect(_rowFor('hasLower').classList.contains('gr-strength-rule--ok')).toBe(
      true,
    );
    expect(_rowFor('hasDigit').classList.contains('gr-strength-rule--ok')).toBe(
      true,
    );
    expect(_rowFor('matches').classList.contains('gr-strength-rule--ok')).toBe(
      false,
    );

    ctrl.destroy();
  });

  it('flips the matches rule only when confirmation equals password (and non-empty)', () => {
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('pw'),
      confirmInput: document.getElementById('confirm'),
      rulesListEl: document.querySelector(
        '[data-testid="password-rules-checklist"]',
      ),
      meterEl: document.getElementById('meter'),
      meterLabelEl: document.getElementById('meter-label'),
    });

    const pw = document.getElementById('pw');
    const confirm = document.getElementById('confirm');

    pw.value = 'ValidPass1';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    confirm.value = '';
    confirm.dispatchEvent(new Event('input', { bubbles: true }));
    expect(_rowFor('matches').classList.contains('gr-strength-rule--ok')).toBe(
      false,
    );

    confirm.value = 'DifferentPass';
    confirm.dispatchEvent(new Event('input', { bubbles: true }));
    expect(_rowFor('matches').classList.contains('gr-strength-rule--ok')).toBe(
      false,
    );

    confirm.value = 'ValidPass1';
    confirm.dispatchEvent(new Event('input', { bubbles: true }));
    expect(_rowFor('matches').classList.contains('gr-strength-rule--ok')).toBe(
      true,
    );

    ctrl.destroy();
  });

  it('keeps matches false forever when confirmInput is null (single-field pages)', () => {
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('pw'),
      confirmInput: null,
      rulesListEl: document.querySelector(
        '[data-testid="password-rules-checklist"]',
      ),
      meterEl: document.getElementById('meter'),
      meterLabelEl: document.getElementById('meter-label'),
    });

    const pw = document.getElementById('pw');
    pw.value = 'ValidPass1';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(_rowFor('matches').classList.contains('gr-strength-rule--ok')).toBe(
      false,
    );

    pw.value = 'ValidPass1Changed';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(_rowFor('matches').classList.contains('gr-strength-rule--ok')).toBe(
      false,
    );

    ctrl.destroy();
  });

  it('lights up exactly <score> segments and sets aria-valuenow to the score', () => {
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('pw'),
      confirmInput: document.getElementById('confirm'),
      rulesListEl: document.querySelector(
        '[data-testid="password-rules-checklist"]',
      ),
      meterEl: document.getElementById('meter'),
      meterLabelEl: document.getElementById('meter-label'),
    });

    const meter = document.getElementById('meter');
    const pw = document.getElementById('pw');

    pw.value = 'aaaaaaaa';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(_segmentsOn().length).toBe(1);
    expect(meter.getAttribute('aria-valuenow')).toBe('1');
    expect(meter.classList.contains('gr-strength-meter--tier-1')).toBe(true);

    pw.value = 'aaaaaaaaA';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(_segmentsOn().length).toBe(2);
    expect(meter.classList.contains('gr-strength-meter--tier-2')).toBe(true);

    pw.value = 'aaaaaaaaA1';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(_segmentsOn().length).toBe(3);
    expect(meter.classList.contains('gr-strength-meter--tier-3')).toBe(true);

    pw.value = 'StrongP4ssword!!';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(_segmentsOn().length).toBe(4);
    expect(meter.classList.contains('gr-strength-meter--tier-4')).toBe(true);

    pw.value = '';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(_segmentsOn().length).toBe(0);
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
    expect(meter.classList.contains('gr-strength-meter--tier-1')).toBe(false);
    expect(meter.classList.contains('gr-strength-meter--tier-4')).toBe(false);

    ctrl.destroy();
  });

  it('updates the verbal label to match METER_TIERS[score]', () => {
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('pw'),
      confirmInput: document.getElementById('confirm'),
      rulesListEl: document.querySelector(
        '[data-testid="password-rules-checklist"]',
      ),
      meterEl: document.getElementById('meter'),
      meterLabelEl: document.getElementById('meter-label'),
    });

    const label = document.getElementById('meter-label');
    const pw = document.getElementById('pw');

    pw.value = '';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(label.textContent).toBe('—');

    pw.value = 'aaaaaaaa';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(label.textContent).toBe('Débil');

    pw.value = 'aaaaaaaaA';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(label.textContent).toBe('Aceptable');

    pw.value = 'aaaaaaaaA1';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(label.textContent).toBe('Buena');

    pw.value = 'StrongP4ssword!!';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(label.textContent).toBe('Fuerte');

    ctrl.destroy();
  });

  it('updates only the meter when rulesListEl is null', () => {
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('pw'),
      confirmInput: document.getElementById('confirm'),
      rulesListEl: null,
      meterEl: document.getElementById('meter'),
      meterLabelEl: document.getElementById('meter-label'),
    });

    const pw = document.getElementById('pw');
    pw.value = 'ValidPass1';
    pw.dispatchEvent(new Event('input', { bubbles: true }));

    expect(_segmentsOn().length).toBe(3);
    // No rules were updated — the rule rows were never queried, but
    // the DOM still contains them. Their --ok class should not have
    // been toggled.
    expect(
      _rowFor('minLength').classList.contains('gr-strength-rule--ok'),
    ).toBe(false);

    ctrl.destroy();
  });

  it('updates only the rules when meterEl is null', () => {
    document.body.innerHTML = `
      <input id="pw" />
      <input id="confirm" />
      <ul data-testid="password-rules-checklist">
        <li class="gr-strength-rule" data-rule="minLength"><span class="gr-strength-rule-label">x</span></li>
        <li class="gr-strength-rule" data-rule="matches"><span class="gr-strength-rule-label">x</span></li>
      </ul>
    `;
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('pw'),
      confirmInput: document.getElementById('confirm'),
      rulesListEl: document.querySelector(
        '[data-testid="password-rules-checklist"]',
      ),
      meterEl: null,
      meterLabelEl: null,
    });

    const pw = document.getElementById('pw');
    pw.value = 'ValidPass1';
    pw.dispatchEvent(new Event('input', { bubbles: true }));

    expect(
      _rowFor('minLength').classList.contains('gr-strength-rule--ok'),
    ).toBe(true);

    ctrl.destroy();
  });

  it('destroy() removes the input listeners on both fields', () => {
    const pw = document.getElementById('pw');
    const confirm = document.getElementById('confirm');
    const removeSpyPw = vi.spyOn(pw, 'removeEventListener');
    const removeSpyConfirm = vi.spyOn(confirm, 'removeEventListener');

    const ctrl = mountPasswordStrengthMeter({
      passwordInput: pw,
      confirmInput: confirm,
      rulesListEl: document.querySelector(
        '[data-testid="password-rules-checklist"]',
      ),
      meterEl: document.getElementById('meter'),
      meterLabelEl: document.getElementById('meter-label'),
    });

    ctrl.destroy();

    expect(removeSpyPw).toHaveBeenCalledWith('input', expect.any(Function));
    expect(removeSpyConfirm).toHaveBeenCalledWith(
      'input',
      expect.any(Function),
    );

    // Typing after destroy must NOT trigger an update.
    pw.value = 'ValidPass1';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(
      _rowFor('minLength').classList.contains('gr-strength-rule--ok'),
    ).toBe(false);
    expect(_segmentsOn().length).toBe(0);
  });

  it('destroy() works with only passwordInput bound (no confirm listener to remove)', () => {
    const ctrl = mountPasswordStrengthMeter({
      passwordInput: document.getElementById('pw'),
      confirmInput: null,
      rulesListEl: document.querySelector(
        '[data-testid="password-rules-checklist"]',
      ),
      meterEl: document.getElementById('meter'),
      meterLabelEl: document.getElementById('meter-label'),
    });

    expect(() => ctrl.destroy()).not.toThrow();
  });
});
