# Verification Report (Re-verify — v2)

**Change**: 2026-09-08-fix-css-tokens-date-picker-spinner-breadcrumb
**Version**: N/A
**Mode**: Standard (Strict TDD not applicable — pure CSS token replacement)
**Re-verify context**: CRITICAL from v1 report (obs #709) was `date-picker.component.css` still using `var(--dark-text)` at lines 65 & 117. Fixed in commit `eb158aabd`.

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 11 |
| Tasks complete | 9 |
| Tasks incomplete | 2 (T.3.3 sdd-verify — closed by this report; T.3.4 archive — pending) |

T.2.4 (`pnpm test:e2e` full run with `BASE_URL`/`E2E_PASSWORD`) is still marked pending-CI in tasks.md/apply-progress.md, but the relevant sub-test file (`css-tokens-policy.e2e.ts`) does not require a live server or credentials — it is a pure filesystem scan. It was executed directly in this re-verify (see Spec Compliance Matrix) and confirms the fix. Recommend updating T.2.4 to reflect this partial real-execution evidence, non-blocking.

---

### Build & Tests Execution

**Build**: PASSED
```
ng build — Application bundle generation complete. [4.376s]
Output location: frontend/dist
```

**Tests**: PASSED — 73 suites / 509 tests, 0 failed, 0 skipped

**Lint**: PASSED — 0 errors, 74 pre-existing warnings (all in files unrelated to this change — `no-explicit-any`, unused eslint-disable directives)

**Coverage**: Not measured (no coverage flag configured for this change; not required by spec)

---

### Grep Verification (Legacy vars in the 3 target files)

| File | `--primary-color` | `--secondary-color` | `--dark-text` |
|---|---|---|---|
| date-picker.component.css | 0 | 0 | 0 ✅ (was 2 FAIL at lines 65,117 in v1 — fixed) |
| spinner.component.css | 0 | n/a | n/a |
| breadcrumb.component.css | n/a | n/a | 0 |

Confirmed via direct grep re-run and via `Read` of date-picker.component.css lines 55-124 — lines 65 and 117 now read `color: var(--color-on-tint-graphite);`.

---

### Real Execution of css-tokens-policy.e2e.ts (Playwright, filesystem-only, no server needed)

```
npx playwright test e2e/css-tokens-policy.e2e.ts
PASS (5) FAIL (2)
```

| Sub-test (legacy var) | In this change's scope? | Result |
|---|---|---|
| `--primary-color` | Yes (S1, S3) | ✅ PASS |
| `--secondary-color` | Yes (S2) | ✅ PASS |
| `--accent-color` | No | ✅ PASS |
| `--dark-text` | Yes (S4 + CRITICAL fix) | ✅ PASS |
| `--light-bg` | No | ✅ PASS |
| `--muted-text` | No (pre-existing, out of scope) | ❌ FAIL — 4 offenders: breadcrumb.component.css:4, date-picker.component.css:77,97, _layout.css:273 |
| `--border-color` | No (pre-existing, out of scope) | ❌ FAIL — 2 offenders: date-picker.component.css:43, _layout.css:191 |

All 3 sub-tests targeted by this change (`--primary-color`, `--secondary-color`, `--dark-text`) now pass. The 2 remaining failures (`--muted-text`, `--border-color`) are pre-existing, out-of-scope legacy vars flagged as WARNING in v1 and unchanged in v2 — do not block this change.

---

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Legacy variables removed | S1: date-picker no `--primary-color` | grep + `css-tokens-policy.e2e.ts > "--primary-color"` | ✅ COMPLIANT |
| Legacy variables removed | S2: date-picker no `--secondary-color` | grep + `css-tokens-policy.e2e.ts > "--secondary-color"` | ✅ COMPLIANT |
| Legacy variables removed | S3: spinner no `--primary-color` | grep + `css-tokens-policy.e2e.ts > "--primary-color"` | ✅ COMPLIANT |
| Legacy variables removed | S4: breadcrumb no `--dark-text` | grep + `css-tokens-policy.e2e.ts > "--dark-text"` | ✅ COMPLIANT |
| E2E policy test | S5: css-tokens-policy.e2e.ts 0 failures for the 3 originally-failing sub-tests | `css-tokens-policy.e2e.ts` (executed directly) | ✅ COMPLIANT (was ❌ FAILING in v1 due to `--dark-text` in date-picker) |
| No regressions | S6: `pnpm test` + `ng build` clean | jest (509/509), `ng build` | ✅ COMPLIANT |

**Compliance summary**: 6/6 scenarios compliant.

---

### Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|---|---|---|
| S1/S3 `--primary-color` → `--color-brand-primary` | ✅ Implemented | 0 occurrences remain in the 3 files |
| S2 `--secondary-color` → `--color-border-subtle` | ✅ Implemented | 0 occurrences remain |
| S4 `--dark-text` → `--color-on-tint-graphite` | ✅ Implemented | breadcrumb fixed in v1; date-picker fixed in v2 (commit eb158aabd) |

---

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Token mapping table (primary→brand-primary, secondary→border-subtle, dark-text→on-tint-graphite) | ✅ Yes | Applied consistently including the date-picker `--dark-text` fix |
| File Changes table (design.md) | ⚠️ Was incomplete (already noted in v1) | design.md's original usage audit for date-picker.component.css did not list the 2 `--dark-text` usages; fix applied without updating design.md's table. Cosmetic only — implementation is correct. |

---

### Issues Found

**CRITICAL** (must fix before archive):
None. The v1 CRITICAL (`--dark-text` remaining in date-picker.component.css) is resolved and confirmed via grep, source read, and real Playwright execution.

**WARNING** (should fix):
1. `css-tokens-policy.e2e.ts` still has 2 failing sub-tests (`--muted-text`, `--border-color`) — pre-existing, out of this change's declared scope (3 vars only). Recommend a follow-up change to close these, or explicitly document the deferral in this change's archive notes so it isn't mistaken for a regression later.
2. design.md's File Changes table for date-picker.component.css was never updated to reflect the 2 additional `--dark-text` usages found and fixed post-v1-verify. Cosmetic, does not affect correctness, but recommend a one-line addendum for audit trail completeness.
3. tasks.md/apply-progress.md still mark T.2.4 as "pending CI" — in this re-verify, `css-tokens-policy.e2e.ts` was run directly and passed for all in-scope sub-tests without needing `BASE_URL`/`E2E_PASSWORD` (it's a filesystem-only test, no browser navigation). Recommend updating task status to reflect this evidence.

**SUGGESTION** (nice to have):
1. tasks.md arithmetic label inconsistency ("3 admin" vs 4 listed items under Phase 3) — non-blocking, carried over from v1.

---

### Verdict

**PASS.** The CRITICAL from v1 is resolved and confirmed with real execution evidence (grep, source inspection, and a direct Playwright run of the policy test). Build, unit tests, and lint are all green. 6/6 spec scenarios compliant. Remaining items are WARNING/SUGGESTION only (pre-existing out-of-scope legacy vars, minor doc/task-status housekeeping) and do not block archive.
