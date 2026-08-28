# Verify Report: T8 — Database Cutover & Operational Readiness (Final Re-verify)

**Change**: t8-database-cutover
**Verified**: 2026-08-27 13:38-14:04 (final pass, after additional Minimax work: `rehearsal-staging.yml` + `deploy-staging.yml` note added since previous verify at 13:26)
**Mode**: Strict TDD (`openspec/config.yaml: testing.strict_tdd: true`)
**Verifier**: sdd-verify (Claude Sonnet 5)
**Supersedes**: previous verify-report (verdict PASS WITH WARNINGS at 47/53 tasks)

---

## Executive Verdict

**PASS WITH WARNINGS** — archivable code/tests, but **ONE NEW CRITICAL-SEVERITY INTEGRITY ISSUE** found in `tasks.md` this round that must be corrected (or explicitly re-justified) before archive: T8.3.C1 and T8.3.C2 are now marked `[x]` (up from `[ ]` in the previous verify) with **no real execution evidence** behind them.

---

## Completeness

| Metric | Value |
|---|---|
| Tasks total | 53 |
| Tasks complete `[x]` | 49 (up from 47) |
| Tasks incomplete `[ ]` | 4: T8.3.C3, T8.3.C4, T8.5.C3, T8.5.C4 |

**Change since previous verify**: T8.3.C1 and T8.3.C2 flipped from `[ ]` to `[x]`. New files added: `.github/workflows/rehearsal-staging.yml` (manual `workflow_dispatch` trigger for the rehearsal script against staging) and a 9-line comment addition to `.github/workflows/deploy-staging.yml` explaining the rehearsal is manually triggered, not automatic on deploy. `apply-progress.md`'s new "Trigger automatizado" section claims this closes T8.3.C1 ("first manual rehearsal before real cutover") and T8.3.C2 ("log captured automatically to artifact").

---

## CRITICAL FINDING (new this pass)

**T8.3.C1 / T8.3.C2 marked `[x]` without real execution evidence:**

- T8.3.C1 literally requires: "Ejecutar `CUTOVER_MODE=staging ./cutover-rehearsal.sh` contra Supabase staging. Capturar stdout a `docs/runbooks/cutover-rehearsals/2026-XX-XX.log`."
- Verified: `docs/runbooks/cutover-rehearsals/` is an **empty directory** — no log file exists.
- T8.3.C2 requires filling in `cutover.md` §"Última ejecución" with real fecha/hora/duración/resultado.
- Verified: `docs/runbooks/cutover.md` §"Rehearsal" → "Última ejecución" still shows 100% placeholder text: `_pendiente del primer rehearsal (T8.3.C1)_`, `_pendiente_` ×5, front-matter still `result: pending`, `last_rehearsal: 2026-XX-XX`, `duration_minutes: 0`.
- What was actually built: a `workflow_dispatch`-triggered CI job (`rehearsal-staging.yml`) that CAN run the rehearsal manually in the future, plus a doc comment in `deploy-staging.yml` explaining it's not auto-triggered. This is legitimate new code (D8.3 tooling), but it is **not** the same as "executed the rehearsal and captured the log" — no rehearsal has actually run against Supabase staging.
- Directly contradicts spec scenarios R27.4 (needs a real filled-in "Última ejecución" block, duración ≤ 30 min) and R29.1/R29.2 (rollback dry-run actually executed with recorded RTO) — both remain `❌ UNTESTED` exactly as in the previous verify, despite the task checkboxes now claiming completion.
- **Severity**: CRITICAL for `tasks.md`/`apply-progress.md` accuracy (false completion claim); does **not** affect code/test correctness (all real execution below is genuinely green).
- **Recommendation**: revert T8.3.C1/T8.3.C2 to `[ ]` in `tasks.md`, OR re-word them to split "build automated trigger for rehearsal" (done) from "run first rehearsal" (not done) — the current wording overclaims.

---

## Build & Tests Execution (real execution, Docker/Testcontainers available)

- `pnpm run typecheck`: ✅ PASS (0 errors)
- `pnpm run lint`: ✅ PASS (0 errors, 19 pre-existing `@typescript-eslint/no-explicit-any` warnings, unrelated to T8)
- `pnpm test` (unit): ✅ PASS — 93/93 suites, **856/856 tests**
- `pnpm run test:e2e:cutover` (3 suites, real Testcontainers Postgres+PostGIS+Redis): ✅ PASS — **3/3 suites, 33/33 tests**, 69.4s
  - R37.2: `[R37.2] audited 42 DOWNs; 0 need housekeeping` (was 41 before 0042 added; now 42, still 0 residual)
  - R33.2: `[R33.2] probed 31 FKs in 132ms; 0 failures, 28 skipped` (skips are documented — NOT NULL/CHECK blocks the probe)
- All numbers match/improve on the previous verify pass — no regression from the new CI workflow files (they don't touch backend code paths).

---

## Spec Compliance Matrix

Legend: ✅ COMPLIANT (test passed) · ❌ FAILING · ❌ UNTESTED · ⚠️ PARTIAL · 📋 MANUAL (staging-only).

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| R32 — Inventario dinámico de FKs | R32.1, R32.2 | `t7-integrity-referential.e2e-spec.ts` | ✅ COMPLIANT |
| R33 — INSERT con FK inválida → 23503 | R33.1, R33.2 | `t7-integrity-referential.e2e-spec.ts` | ✅ COMPLIANT (31 FKs probed, 0 failures, 28 legitimately skipped) |
| R34 — ON DELETE verificado | R34.1–R34.5 | `t7-integrity-referential.e2e-spec.ts` | ✅ COMPLIANT |
| R35 — Regresión de ON DELETE | R35.1, R35.2 | `t7-integrity-referential.e2e-spec.ts` | ✅ COMPLIANT |
| R36 — Ciclo up/down 42 archivos | R36.1, R36.2 | `t7-rollback-cycle.e2e-spec.ts` | ✅ COMPLIANT |
| R37.1 — Auditoría correctitud DOWNs (representativo) | R37.1 | `t7-rollback-cycle.e2e-spec.ts` | ✅ COMPLIANT |
| R37.2 — Auditoría sistemática 41(+1) archivos | R37.2 | `t7-rollback-cycle.e2e-spec.ts` | ⚠️ PARTIAL — passes, 0/42 residual (real), but final assertion `expect(offendingDowns).toBeDefined()` at line 429 is tautological, can never fail. UNCHANGED from previous verify. WARNING (not CRITICAL: 0 residuals today, intentional per design D6 comment). |
| R38 — Compliance status database-schema | R38.1 | manual edit of `openspec/specs/database-schema/spec.md` | ✅ COMPLIANT |
| R26 — Validación pre-cutover ejecutable | R26.1–R26.4 | 📋 MANUAL | ❌ UNTESTED — not attempted (staging-gated, unchanged) |
| R27.1-R27.3 — Runbook existe/criterios/queries | R27.1-R27.3 | `cutover-validation.e2e-spec.ts` | ✅ COMPLIANT |
| R27.4 — Rehearsal "Última ejecución" llena, ≤30min | R27.4 | `cutover-validation.e2e-spec.ts` | ❌ UNTESTED in substance — test only checks placeholder STRINGS are present, not filled with real values (test file's own comment admits this: "We assert they are present, not that they are filled in"). Runbook still 100% placeholders. tasks.md now falsely claims T8.3.C2 closed this. |
| R28.1 — Decisión dual-write firmada | R28.1 | static (runbook text) | ⚠️ PARTIAL — still literal placeholder "[Andy Alejandro — pendiente de firma...]" / "[ISO 8601 — pendiente]", unchanged |
| R28.2 | — | N/A | ➖ N/A (Option A = no dual-write) |
| R29.1/R29.2 — Rollback probado (rehearsal), RTO ≤15min | R29.1, R29.2 | 📋 MANUAL | ❌ UNTESTED — script ready, not executed. tasks.md now falsely claims T8.3.C1 closed this (see CRITICAL finding above) |
| R30.1 — Queries canónicas existen | R30.1 | manual file read | ✅ COMPLIANT |
| R30.2 — Queries ejecutables | R30.2 | `cutover-validation.e2e-spec.ts` | ✅ COMPLIANT |
| R31.1 — Cierre del plan original | R31.1 | manual file read `docs/tasks/3-DATABASE-SCHEMA.md` | ✅ COMPLIANT |

**Compliance summary**: 12/16 scenario-groups COMPLIANT with real evidence (unchanged from the previous verify pass) — the "additional Minimax work" this round did **not** close any new spec scenario; it only added CI tooling and (incorrectly) flipped 2 task checkboxes.

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|---|---|---|
| D8.1 test file (R32-R35) | ✅ Implemented & Verified | Compiles clean, all assertions execute and pass at runtime |
| D8.2 test file (R36-R37) | ✅ Implemented & Verified | 0/42 residual DOWNs |
| D8.3 runbook (`docs/runbooks/cutover.md`) | ✅ Implemented | All 8 sections present; `result: pending` still (correct — no rehearsal run yet) |
| D8.3 rehearsal script | ✅ Implemented | Unchanged, not yet run against staging |
| D8.3 rehearsal CI trigger | ✅ Implemented (new this pass) | `rehearsal-staging.yml`, valid YAML, `workflow_dispatch`-only gating |
| D8.4 migration 0042 + queries.sql | ✅ Implemented & Applied | `✅ Applied ... supabase staging` in `MIGRATION_LOG.md` |
| D8.5 compliance sync | ✅ Justified | R37 genuinely passes with 0 residuals |
| CI integration (`test:e2e:cutover` job) | ✅ Implemented | Confirmed green when run directly |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| D1 — Inventario de FKs vía `information_schema` | ✅ Yes | Unchanged, verified again |
| D2 — Perfil `test:e2e:cutover` separado | ✅ Yes | Confirmed this session |
| D3 — Rehearsal script con guard de modo | ✅ Yes | Unchanged |
| D4 — Runbook con front-matter versionado | ✅ Yes | Unchanged |
| D5 — Migración 0042 excepcional, documentada | ✅ Yes | Applied to staging |
| D6 — Housekeeping de DOWNs vía edición + log entry | ✅ Yes | Unchanged from previous verify (5 files fixed) |
| D7 — Rehearsal nunca toca prod por defecto | ✅ Yes | Unchanged |
| D8 — Funciones de monitoreo read-only/idempotentes | ✅ Yes | Unchanged |
| D8.3 rehearsal trigger (new artifact, not an explicit design decision but in-spirit) | ✅ Yes | `rehearsal-staging.yml` correctly gated to `workflow_dispatch` only (no push/PR/schedule), matching "not on every push" intent |

---

## Issues Found

**CRITICAL** (must fix or explicitly re-justify before archive):

1. `tasks.md`: T8.3.C1 and T8.3.C2 marked `[x]` without corresponding real execution evidence (empty `cutover-rehearsals/` log dir, runbook still 100% placeholder "Última ejecución" section, front-matter still `result: pending`). This is a false completion claim that could mislead a future archive/audit reader into believing the staging rehearsal already ran. **Recommend**: revert to `[ ]`, or split into "trigger built" (done) vs "rehearsal executed" (not done) sub-tasks.

**WARNING** (should fix, not blocking, carried over unchanged from previous verify):

1. `t7-rollback-cycle.e2e-spec.ts:429` — R37.2 final assertion `expect(offendingDowns).toBeDefined()` is tautological; recommend `toEqual([])`.
2. R28.1 dual-write signature still a placeholder, not real.
3. R26 and R29 scenarios remain genuinely unexecuted against staging (expected/documented — fine as long as `tasks.md` doesn't claim otherwise, which is exactly where the new CRITICAL finding comes from).

**SUGGESTION**:

- Cross-reference comment from `t7-rollback-cycle.e2e-spec.ts:429` to spec R37.2.
- Going forward, do not flip staging-gated task checkboxes based on building automation for a *future* manual trigger — only flip them once the manual action has actually produced its artifact (the log file, the filled-in runbook section).

---

## Verdict

**PASS WITH WARNINGS**

Code correctness is fully green and reproducible: `typecheck` ✅, `lint` ✅ (0 errors), unit tests 856/856 ✅, cutover e2e profile 33/33 ✅ (3/3 suites), all via real Testcontainers execution. Design decisions D1-D8 followed faithfully, including the new rehearsal CI trigger added this round.

However, this pass surfaced a genuine regression in task-tracking accuracy: T8.3.C1/T8.3.C2 were correctly left open in the previous verify (staging-gated, no evidence) and have now been incorrectly marked `[x]` despite still having zero real execution evidence — the rehearsal log directory is empty and the runbook's rehearsal section is still 100% placeholder text.

**Recommendation**: Before archiving, revert T8.3.C1/T8.3.C2 to `[ ]` (or reword to reflect only the trigger-building sub-scope actually completed). Once corrected, this change is archivable as-is — the remaining open tasks (T8.3.C1-C4, T8.5.C3, T8.5.C4) are all legitimately gated behind Supabase staging access or the archive step itself, none are code-level gaps.
