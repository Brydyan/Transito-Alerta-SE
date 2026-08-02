# SC-143: Testing & Validation Guide

## Quick Start: Run Parity Tests Locally

```bash
# Install dependencies (one-time)
cd frontend
npm install

# Run Cypress tests (visual parity suite)
npm run test:snapshot

# Run full E2E suite (includes parity tests)
npm run test:e2e

# Run CI linter check locally
cd ..
bash -c 'ERRORS=0; FORBIDDEN_CLASSES=(".gr-form-label" ".gr-input-wrap" ".gr-input-icon" ".gr-input-eye" ".gr-input-error" ".gr-input" ".gr-input--pad-right"); for class in "${FORBIDDEN_CLASSES[@]}"; do while IFS= read -r file; do if grep -E "${class}\s*[{,]" "$file" 2>/dev/null | grep -v "^\s*/\*"; then echo "ERROR: Shared form utility class \"${class}\" found defined in component CSS: $file"; ERRORS=$((ERRORS + 1)); fi; done < <(find frontend/app -name "*.component.css"); done; exit $ERRORS'
```

## Test Cases (13 total)

### Login (Register Mode) — 5 tests
- **CT-PWD-001:** Base classes (.gr-input, .gr-input--pad-right, .gr-input-wrap, .gr-input-icon, .gr-input-eye)
- **CT-PWD-002:** Dimensions (50px height, 12px radius, 44px padding)
- **CT-PWD-003:** Focus state (primary color, shadow ring)
- **CT-PWD-004:** No strength meter / no rules checklist
- **CT-PWD-005:** Error message styling

### Accept-Invite — 6 tests
- **CT-PWD-006:** Identical base classes to login
- **CT-PWD-007:** Identical dimensions to login
- **CT-PWD-008:** Identical focus state to login
- **CT-PWD-009:** HAS strength meter (intentional extra)
- **CT-PWD-010:** HAS rules checklist (intentional extra)
- **CT-PWD-011:** Error message styling

### Visual CSS Parity — 1 test
- **CT-PWD-012:** Pixel-identical computed CSS properties (captures both login & invite snapshots and compares)

### Regression Guards — 1 test
- **CT-PWD-015:** CI grep check is in place (placeholder for CI enforcement)

## Manual Testing

### Step 1: Visual Audit (Side-by-side)

```bash
npm run dev

# Open two browser tabs:
# Tab 1: http://localhost:3000/#/login?mode=register
# Tab 2: http://localhost:3000/#/accept-invite?token=test-token
```

**Compare:**
- Input height / border radius / padding
- Icon alignment / color
- Eye toggle positioning / appearance
- Focus ring color / spread
- Error message position / color / font-size

**Expected:** Identical except strength meter + rules (tab 2 only)

### Step 2: CSS Snapshot Comparison

Open browser DevTools on both tabs, Inspect password input:

**Tab 1 (login/register):**
```
height: 50px;
border: 1px solid rgb(185, 189, 201);
border-radius: 12px;
padding: 0 44px 0 44px;
font-size: 16px; /* !important override */
box-shadow: none;
```

**Tab 2 (accept-invite):**
```
height: 50px;  ← Same
border: 1px solid rgb(185, 189, 201);  ← Same
border-radius: 12px;  ← Same
padding: 0 44px 0 44px;  ← Same
font-size: 16px;  ← Same
box-shadow: none;  ← Same
```

**On focus:**
Both should show:
```
border-color: rgb(106, 92, 243);
box-shadow: 0 0 0 3px rgba(106, 92, 243, 0.12);
```

### Step 3: Intentional Extras Verification

**In /accept-invite only:**
1. Type a password → strength meter updates live (0–4 segments)
2. Rules checklist updates: min length ✓, has uppercase ✓, etc.

**In /login (register mode):**
- No strength meter
- No rules checklist
- Plain password input + toggle

## CI Validation

On every push/PR:

```yaml
frontend-quality job:
  ✓ Run frontend lint
  ✓ Run frontend format check
  ✓ Check form utility class scope (SC-143) ← NEW
  
frontend-tests job:
  ✓ Unit tests
  ✓ Integration tests
  ✓ Snapshot tests (includes password-field-parity.cy.js) ← NEW
```

If CI fails:

```
ERROR: Shared form utility class '.gr-input' found defined in component CSS.
CONTEXT: These classes must be defined EXCLUSIVELY in frontend/public/css/app.css
FIX: Remove the class definition from .component.css
```

**Action:** Find the file, remove the duplicate class, re-push.

## Debugging

### Snapshot Differs Between Pages

**Symptom:** `expect(login.height).to.equal(accept.height)` fails

**Debug:**
1. Both pages use `.gr-input` class?
2. Is `.gr-input` redefined in component CSS? → CI would catch this
3. Is there a media query or state-specific override?
4. Check app.css for recent changes to `.gr-input` block

### Test Passes Locally, Fails in CI

**Likely cause:** Node/browser version difference in CI runner

**Fix:** 
- Ensure frontend package.json has exact versions
- Run tests in Docker (matches CI environment)

### Eye Toggle Not Working

**This doesn't affect parity tests** but affects UX:
- Check `data-eye-for="invite-password"` / `data-eye-for="register-password"` match input IDs
- Verify toggle JavaScript is loaded

## Future: Visual Snapshot Storage

When Cypress visual snapshot plugin is installed:

```bash
# Baseline runs (first time)
npm run test:e2e -- --record

# After CSS changes, compare:
npm run test:e2e
# Cypress shows visual diff automatically
```

---

**Last updated:** 2026-07-28
