# SC-143: Password Field Parity (Design Decision & Implementation)

## Summary

Password input fields in `/login` (register mode) and `/accept-invite` must be visually identical in base styling, with intentional UX differences documented and tested.

## Decision

### Base Styling: Identical (Single Source of Truth)

All password fields use shared utility classes defined **exclusively** in `frontend/public/css/app.css`:

- `.gr-form-label` — label styling
- `.gr-input-wrap` — wrapping container
- `.gr-input-icon` — left icon (lock)
- `.gr-input` — base input (50px height, 12px radius, specific padding/border)
- `.gr-input--pad-right` — reserved space for icon (eye toggle)
- `.gr-input-eye` — toggle button
- `.gr-input-error` — error message styling

**Why single source?**
- Prevents accidental divergence (a CSS change in one component breaks the other silently)
- Guarantees visual consistency across all auth pages (login, register, forgot-password, accept-invite, reset-password, verify-email)

### Intentional Extras: Accept-Invite Only

`/accept-invite` has two extra UX features that `/login` (register mode) deliberately does NOT have:

1. **Password strength meter** (`id="invite-password-meter"`)
   - Visual bar showing strength (0–4 segments)
   - Helps users during account activation

2. **Rules checklist** (`id="invite-password-rules"`)
   - Live validation UI: minLength, hasUpper, hasLower, hasDigit, matches
   - Mirrors backend validation regex
   - Only shown in accept-invite flow

**Why intentional extras in accept-invite?**
- Registration flow in login is lighter (fewer fields, simpler UX)
- Invite acceptance is a one-time, high-stakes action (rules checklist provides confidence)
- Product decision: different flows have different needs

## Implementation

### 1. Shared CSS (Source of Truth)

**File:** `frontend/public/css/app.css` (lines 1062–1160+)

```css
/* ─── Shared form utilities (sc-130 fix, sc-143 parity) ──────────
   ... (see app.css for full block comment)
*/

.gr-form-label { /* base styling */ }
.gr-input-wrap { /* container */ }
.gr-input-icon { /* left icon */ }
.gr-input { /* main input */ }
.gr-input--pad-right { /* right space */ }
.gr-input:focus { /* focus ring */ }
.gr-input-eye { /* toggle button */ }
.gr-input-error { /* error text */ }
```

**Rule:** These classes MUST NOT be defined anywhere else. Period.

### 2. CI Enforcement (Grep Check)

**File:** `.github/workflows/ci.yml` → Job: `frontend-quality` → Step: `Check form utility class scope (SC-143)`

```yaml
- name: Check form utility class scope (SC-143)
  run: |
    ERRORS=0
    FORBIDDEN_CLASSES=(".gr-form-label" ".gr-input-wrap" ... ".gr-input--pad-right")
    for class in "${FORBIDDEN_CLASSES[@]}"; do
      if grep -r "${class}\s*[{,]" app/**/*.component.css | grep -v '^\s*/\*'; then
        echo "ERROR: Shared form utility class '${class}' found defined in component CSS."
        ERRORS=$((ERRORS + 1))
      fi
    done
    if [ $ERRORS -gt 0 ]; then exit 1; fi
```

**What it does:**
- Searches all `.component.css` files for class definitions (not references)
- Fails the build if any forbidden class is redefined
- Ignores comments

**When it runs:**
- Every push to `main`, `develop`
- Every pull request

### 3. Cypress Parity Tests

**File:** `frontend/cypress/e2e/password-field-parity.cy.js`

**Test matrix:**

| Test ID | Scope | What it Checks |
|---------|-------|---|
| CT-PWD-001 to 005 | Login (register mode) | Base classes, height/padding, focus ring, no extras, error styling |
| CT-PWD-006 to 011 | Accept-Invite | Identical base to login, **HAS** strength meter + rules |
| CT-PWD-012 to 014 | Visual snapshots | Computed CSS properties match pixel-perfectly |
| CT-PWD-015 | Regression guard | Documents CI check (actual enforcement is in workflow) |

**Key test: CT-PWD-014 (Visual Parity)**

Captures computed styles (height, radius, padding, font, colors) from both pages and compares them. If CSS drifts, test fails immediately.

```javascript
expect(loginSnapshot.height).to.equal(acceptInviteSnapshot.height);
expect(loginSnapshot.borderRadius).to.equal(acceptInviteSnapshot.borderRadius);
// ... 10 more properties
```

### 4. HTML Data Attributes (Test Hooks)

Both components have `data-testid` for stable element selection:

**Login:**
```html
<i class="fa-solid fa-lock gr-input-icon" data-testid="password-icon"></i>
<input id="register-password" class="gr-input gr-input--pad-right" ... />
<button class="gr-input-eye" data-testid="password-toggle"></button>
```

**Accept-Invite:**
```html
<i class="fa-solid fa-lock gr-input-icon" data-testid="password-icon"></i>
<input id="invite-password" class="gr-input gr-input--pad-right" ... />
<button class="gr-input-eye" data-testid="password-toggle"></button>
<ul data-testid="password-rules-checklist" ... ></ul>
<div data-testid="password-strength-meter" ... ></div>
```

### 5. Stylelint Config (Future-Ready)

**File:** `frontend/.stylelintrc.json`

Configured but not yet integrated into CI (Stylelint not in package.json). Can be activated by:

```bash
npm install --save-dev stylelint stylelint-config-standard postcss-scss
npm run lint:css  # (add this script to package.json)
```

When enabled, will enforce SC-143 rules at linting time (stricter than regex grep).

## Testing Strategy

### Unit/Component Tests
- Existing component tests (login.component.test.js, accept-invite.test.js) verify form logic
- No changes needed; they already rely on shared classes

### E2E/Visual Tests (NEW)
- Run: `npm run test:e2e` or `npm run test:snapshot`
- File: `frontend/cypress/e2e/password-field-parity.cy.js`
- 15 test cases covering: classes, dimensions, focus, extras, visual snapshots

### CI (Automated)
- On every PR/push: Grep check fails if .gr-input redefined
- On every PR/push: Cypress tests verify parity visually

## Troubleshooting

### "ERROR: Shared form utility class '.gr-input' found defined in component CSS"

**Fix:** Remove the class definition from the component CSS and rely on app.css import.

**Example:**
```css
/* ❌ WRONG — app.auth/pages/login/login.component.css */
.gr-input {
  height: 50px;
  border-radius: 12px;
}

/* ✅ CORRECT — remove it, rely on app.css */
```

### Visual snapshot test fails: "height: 48px !== 50px"

**Diagnosis:** CSS in app.css was changed; both pages inherit the new value but test expected 50px.

**Fix:** 
1. Intentional change? Update test baseline.
2. Accidental change? Revert app.css.
3. Regression in one component? Check for CSS override (will fail CI check).

### Cypress test: "password-strength-meter should not exist in login"

**This is expected!** Accept-invite has the meter; login doesn't. If login gained it, the test correctly fails.

**Fix:** Decide if login should have the meter too (product decision), or verify you didn't accidentally add it.

## Future Improvements

### Short-term (optional)
- Activate Stylelint in CI (stricter AST-based check than grep)
- Add visual snapshots with `cypress-image-snapshot` plugin (pixel-perfect comparison)

### Long-term
- Centralize all form utility classes in a shared SCSS module (requires refactor)
- Document color/spacing tokens as design tokens (Figma sync, CSS variables)
- Automate visual regression testing on every PR (visual diff tool like Percy)

## References

- **Issue:** https://github.com/Ali-Rr26/sistema-incidencias-georreferenciadas/issues/229
- **PR (sc-130):** https://github.com/Ali-Rr26/sistema-incidencias-georreferenciadas/pull/228
- **Commit (CSS scope fix):** `5ecdd22d`

---

**Last updated:** 2026-07-28  
**Decision owner:** Product/UX  
**Enforced by:** CI (grep check) + Cypress (visual tests)
