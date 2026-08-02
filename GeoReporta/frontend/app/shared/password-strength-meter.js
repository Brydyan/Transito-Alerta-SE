/**
 * password-strength-meter.js — shared DOM wiring for the live
 * password strength meter + rules checklist (sc-130 / sc-143).
 *
 * Render pattern (matches avatar-uploader.js):
 *   - Caller renders the markup in their component template.
 *   - Caller passes the elements (NOT selectors) to mountPasswordStrengthMeter().
 *   - The mount function binds input listeners and toggles classes/text.
 *   - destroy() removes the listeners so a component re-mount is clean.
 *
 * Optional DOM: every argument except `passwordInput` and
 * `rulesListEl`/`meterEl` (one of them is required as the "mount point")
 * may be null or missing. The function tolerates that:
 *
 *   - confirmInput === null            → `matches` rule always stays false
 *   - rulesListEl === null             → only the meter updates
 *   - meterEl === null                 → only the rules update
 *   - meterLabelEl === null            → meter renders, label stays frozen
 *
 * Required markup contract:
 *   <ul data-testid="password-rules-checklist">
 *     <li class="gr-strength-rule" data-rule="minLength|hasUpper|hasLower|hasDigit|matches" aria-live="polite">
 *       <span class="gr-strength-rule-icon" aria-hidden="true"><i class="fa-solid fa-circle"></i></span>
 *       <span class="gr-strength-rule-label">…</span>
 *     </li>
 *     …
 *   </ul>
 *
 *   <div data-testid="password-strength-meter" role="meter" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0">
 *     <div class="gr-strength-meter-segments">
 *       <span class="gr-strength-meter-segment"></span> × 4
 *     </div>
 *     <span class="gr-strength-meter-label">—</span>
 *   </div>
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.passwordInput  Password input element (required).
 * @param {HTMLElement|null} [opts.confirmInput]  Confirmation input element. Null if no confirmation field.
 * @param {HTMLElement|null} [opts.rulesListEl]   <ul> holding rule rows. Null to skip rules.
 * @param {HTMLElement|null} [opts.meterEl]       Meter container. Null to skip meter.
 * @param {HTMLElement|null} [opts.meterLabelEl]  Verbal label span. Null to skip label text.
 * @returns {{ destroy: () => void } | null}  Controller, or null when there's no DOM to bind to.
 */
import {
  livePasswordRules,
  scorePassword,
  RULE_LABELS,
  METER_TIERS,
} from './password-rules.js';

const TIER_CLASSES = [
  'gr-strength-meter--tier-1',
  'gr-strength-meter--tier-2',
  'gr-strength-meter--tier-3',
  'gr-strength-meter--tier-4',
];

const RULE_OK_CLASS = 'gr-strength-rule--ok';
const SEGMENT_ON_CLASS = 'gr-strength-meter-segment--on';

export function mountPasswordStrengthMeter({
  passwordInput,
  confirmInput = null,
  rulesListEl = null,
  meterEl = null,
  meterLabelEl = null,
}) {
  // No password field → nothing to wire. Mirror avatar-uploader's
  // "graceful return null" pattern when the required DOM is missing.
  if (!passwordInput) return null;
  // Need at least one of rules or meter to make this call worthwhile.
  if (!rulesListEl && !meterEl) return null;

  const segments = meterEl
    ? Array.from(meterEl.querySelectorAll('.gr-strength-meter-segment'))
    : [];
  const ruleRows = rulesListEl
    ? Array.from(rulesListEl.querySelectorAll('.gr-strength-rule'))
    : [];

  function update() {
    const password = passwordInput.value;
    const confirmation = confirmInput ? confirmInput.value : '';
    const rules = livePasswordRules({
      password,
      passwordConfirmation: confirmation,
    });
    const score = scorePassword(password);

    if (rulesListEl) {
      ruleRows.forEach((row) => {
        const ruleKey = row.getAttribute('data-rule');
        const ok = ruleKey in rules ? Boolean(rules[ruleKey]) : false;
        row.classList.toggle(RULE_OK_CLASS, ok);
        const labelEl = row.querySelector('.gr-strength-rule-label');
        if (
          labelEl &&
          RULE_LABELS[ruleKey] &&
          labelEl.textContent !== RULE_LABELS[ruleKey]
        ) {
          labelEl.textContent = RULE_LABELS[ruleKey];
        }
      });
    }

    if (meterEl) {
      meterEl.setAttribute('aria-valuenow', String(score));
      meterEl.classList.remove(...TIER_CLASSES);
      if (score > 0) {
        meterEl.classList.add(TIER_CLASSES[score - 1]);
      }
      segments.forEach((segment, idx) => {
        segment.classList.toggle(SEGMENT_ON_CLASS, idx < score);
      });
    }

    if (meterLabelEl) {
      meterLabelEl.textContent = METER_TIERS[score] || METER_TIERS[0];
    }
  }

  const onPasswordInput = () => update();
  const onConfirmInput = () => update();

  passwordInput.addEventListener('input', onPasswordInput);
  if (confirmInput) {
    confirmInput.addEventListener('input', onConfirmInput);
  }

  // Initial pass so the meter is the "—/empty" empty state instead
  // of "stale pending" — flips when the user starts typing.
  update();

  return {
    destroy() {
      passwordInput.removeEventListener('input', onPasswordInput);
      if (confirmInput) {
        confirmInput.removeEventListener('input', onConfirmInput);
      }
    },
  };
}
