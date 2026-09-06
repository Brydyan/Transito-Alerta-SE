# Verify Report: AUD — Auditoría y revelación de autoría sellada (sc-327)

**Change**: `2026-09-02-aud-audit-trail-and-identity-reveal`
**Verified**: 2026-09-06 (ronda 3)
**Commit under test**: `b40a16e` (HEAD; `6e44af7` + one unrelated observability commit),
working tree dirty with 7 files: 4 AUD source/test files touched by this round's fix,
2 openspec artifacts (this report + `fixes-required.md`, overwritten by round 2 and
now by this round), and 1 unexpected-but-legitimate collateral file
(`email-verified-guard.e2e-spec.ts`, explained in §3)
**Mode**: Security-review audit with real mutation testing, not a static checklist
**Verdict**: **PASS** (0 CRITICAL, 1 WARNING, 1 SUGGESTION)

This is a re-verification of the round-2 report (FAIL, 1 CRITICAL / 3 WARNING / 2
SUGGESTION — later split into FIX-5 and FIX-6 in `fixes-required.md` when a second,
more severe defect was found in the prescribed fix). **Both round-2 CRITICALs (FIX-5,
FIX-6) are now resolved and confirmed by mutation testing.**

---

## 0. Round-2 CRITICAL follow-up

| # | Round-2 finding | Status | Evidence |
|---|---|---|---|
| FIX-5 | `RolesService.create()`/`update()` bypass the "REVEAL is master-only" guard — only `syncPermissions` had it | **RESOLVED** | `roles.service.ts:145` (`create`) and `:166` (`update`) both call `assertRevealOnlyForMaster` before `save`. Confirmed by mutation — see §1 |
| FIX-6 | The guard compares by role **name**, and `update()` allowed renaming — `reporter`→`master` then granting REVEAL was a two-step bypass; same defect class as sibling change REG's `EmailVerifiedGuard` | **RESOLVED** | `update()` evaluates the **resulting** name/permissions (`dto.name ?? role.name`, `dto.permissions ?? role.permissions`) before the guard runs, and a new `assertSeededNameNotRenamed` rejects renaming to/from any of `master`, `admin_org`, `operador_org`, `operador_sistema`, `reporter`. Confirmed by mutation — see §1 |

---

## 1. Mutation testing — FIX-5 and FIX-6 (the core question)

### 1a. FIX-5 mutation: neuter `assertRevealOnlyForMaster` (make it a no-op)

Backed up `roles.service.ts` to `.bak`, replaced the method body with `return;`, ran:

```
$ npx jest src/modules/roles/roles.service.spec.ts
Test Suites: 1 failed, 1 total
Tests:       6 failed, 35 passed, 41 total
```

Failures, by name:
- `syncPermissions (AUD WARNING-1) > admin_org NO puede incluir REVEAL incidents` (pre-existing)
- `syncPermissions (AUD WARNING-1) > operador_org NO puede incluir REVEAL incidents` (pre-existing)
- `syncPermissions (AUD WARNING-1) > reporter NO puede incluir REVEAL incidents` (pre-existing)
- `syncPermissions (AUD WARNING-1) > un rol nuevo ("auditor") NO puede incluir REVEAL incidents` (pre-existing)
- `create (AUD FIX-5) > rechaza REVEAL incidents en un rol no-master ...` (new)
- `update (AUD FIX-5) > rechaza añadir REVEAL incidents a un rol no-master existente` (new)

All 6 tests that depend on the guard failed with the mock resolving successfully instead
of rejecting — proof the guard is load-bearing for both the pre-existing `syncPermissions`
path and the two new `create`/`update` call sites. Restored from `.bak` immediately;
`git status --short` confirmed identical to the pre-mutation dirty tree (same 7 files,
nothing else).

### 1b. FIX-6 mutation: neuter `assertSeededNameNotRenamed` (make it a no-op)

Same file, same backup, replaced the rename-guard body with `return;`, ran:

```
$ npx jest src/modules/roles/roles.service.spec.ts
Test Suites: 1 failed, 1 total
Tests:       4 failed, 37 passed, 41 total
```

Failures, by name (all in the new `update (AUD FIX-6 ...)` describe block):
- `rechaza el PATCH atómico (rename a master + añadir REVEAL) con REVEAL_NOT_GRANTABLE`
- `rechaza renombrar un rol sembrado (reporter → master) por sí solo, sin permisos`
- `rechaza renombrar un rol sembrado HACIA otro nombre sembrado (master → reporter)`
- `rechaza renombrar a admin_org`

The 5th test in that block, `permite renombrar roles no-sembrados a otros nombres
no-sembrados` (the positive case), correctly **kept passing** with the guard disabled —
it does not exercise the guard, so it should not be a mutation witness. This confirms
the 4 failing tests are true positives, not an artifact of an over-broad mutation.
Restored from `.bak` immediately; `git status --short` confirmed identical to the
pre-mutation dirty tree both times (before and after each of the two mutations).

**Verdict: both fixes are real, not decorative.** Disabling either guard independently
produces exactly the failures each guard's own test suite claims to catch — no more, no
fewer.

---

## 2. Refactor question — did `assertRevealOnlyForMaster` change signature?

**Yes, exactly as fixes-required.md prescribed.** `roles.service.ts:287-299`:

```ts
private assertRevealOnlyForMaster(
  roleName: string | null,
  permissions: readonly string[] | undefined,
): void
```

`create()` calls it directly with `dto.name`/`dto.permissions ?? []` — no synthetic
`RoleEntity` needed. `update()` calls it with the **resulting** name/permissions
(post-dto). `syncPermissions()` calls it with `role.name`/`permissions`. All three
mutation paths into `roles.permissions` now go through the same guard function.

---

## 3. Collateral change — `email-verified-guard.e2e-spec.ts` (not in the 4 files named
by the verification brief, but legitimate)

FIX-6 forbids renaming any seeded role, including `reporter`. A pre-existing e2e test in
the **sibling REG change** (`email-verified-guard.e2e-spec.ts`, sc-325) relied on
`PATCH /roles/:id { name: 'ciudadano' }` against the `reporter` row to demonstrate that
`EmailVerifiedGuard`'s allow-list is name-based. That setup step is no longer legal under
FIX-6 (renaming `reporter` is now rejected with `SEEDED_ROLE_RENAME_FORBIDDEN`), so the
test would fail for a reason unrelated to what it measures.

The fix rewrites the test to create a **new** role (`ciudadano-<uuid>`, non-seeded) with
`CREATE incidents` instead of renaming `reporter`, and soft-deletes it in `finally` to
avoid contaminating the WARNING-A.6 seeded-role walk. The invariant the test asserts
(allow-list by name, deny-by-default for unknown roles) is unchanged and still proven.
Ran this file individually to confirm it is not silently broken:

```
$ npx jest --config ./test/jest-e2e.json -t "EmailVerifiedGuard conectado"
```
(covered by the full e2e run in §5 — all 465 tests pass, including this file's suite)

This is a correct, necessary consequence of closing FIX-6, not scope creep. No `git
checkout --` was used on it; it was inspected and left as-is since it is the implementer's
change, not something I introduced or need to revert.

---

## 4. Non-blocking round-2 recommendations — also closed this round

Round 2's `fixes-required.md` listed three non-blocking items ("do alongside the above if
convenient"). All three were addressed:

- **WARNING-A** (was round-1 CRITICAL-2, downgraded) — 6 new e2e tests added to
  `audit-trail-reveal.e2e-spec.ts`: `GET /incidents` list (A.1), `GET /incidents/feed`
  (A.2), `GET /incidents/export` (A.3) each assert the real author id never appears in
  the response for an anonymous incident; `operador_org` (A.4) and `operador_sistema`
  (A.5) now get explicit 403 coverage on `reveal-reporter`; a direct-SQL walk (A.6)
  confirms only `master` holds `REVEAL incidents` in `roles.permissions` post-migration,
  and that `master` does hold it (guards against "nobody has it" false-green).
- **WARNING-B** — `incidents.service.anonymous.spec.ts`'s `B.6` test's docstring was
  rewritten to accurately describe what it verifies (response-shape safety net, not the
  "regla a medias" defense — that lives in the sibling `B.5` tests), **and** a new
  assertion was added on `repo.create`'s actual call arguments
  (`expect.objectContaining({ isAnonymous: true, citizenId: MASK_ID })`), closing the gap
  the original docstring overclaimed. Both remediation paths offered were done, not just
  one.
- **WARNING-C** — 2 new e2e tests: `filtrar por author_id NO devuelve las publicaciones
  anónimas` (C.1) and `el autor ve sus propias publicaciones anónimas con
  is_anonymous=true` (C.2), closing the two previously-untested spec scenarios "Filtrar
  por autor no revela" and "El autor sí se ve a sí mismo".

---

## 5. Gates — real numbers, this session

| Gate | Command | Result |
|---|---|---|
| backend lint | `npm run lint` | **0 errors**, 24 warnings (pre-existing `no-explicit-any`; none introduced by this round's diff — the 5 new warnings on `incidents.service.anonymous.spec.ts` follow the file's pre-existing style) |
| backend typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| backend build | `nest build` | exit 0 |
| backend unit (targeted) | `npx jest roles.service.spec.ts incidents.service.anonymous.spec.ts` | **2/2 suites, 47/47 tests**, exit 0 |
| backend unit (full) | `npx jest` | **109/109 suites, 989/989 tests**, exit 0. Round-2 baseline: 105/951. **The suite/test count went up** (+4 suites, +38 tests) — traced to HEAD now being `b40a16e` (an unrelated observability commit on top of `6e44af7` adding `request-id.logger.spec.ts`, `request-id.middleware.spec.ts`, `all-exceptions.filter.spec.ts`, and one more), plus this round's 10 new tests in `roles.service.spec.ts` (3 in `create`, 2 in `update` FIX-5, 5 in `update` FIX-6). Net increase is fully explained; no test was removed or skipped |
| backend e2e | `npx jest --config ./test/jest-e2e.json --runInBand` | **53/53 suites, 465/465 tests**, exit 0, ~622s. Round-2 baseline: 53/457. **+8 tests, 0 new suites** — exact match to the 8 new tests added to the existing `audit-trail-reveal.e2e-spec.ts` file (WARNING-A.1–A.6, WARNING-C.1–C.2). First attempt at this run was OOM-killed by the host (exit 137, unrelated to the code under test — the harness/session was killed, not the test process); re-ran with `--runInBand` and a capped heap, completed cleanly |

Working tree was confirmed clean-except-the-7-known-files (`git status --short`) at the
start of the session, after each of the two mutation/restore cycles in §1, and at the
very end — identical set both times, nothing added or lost.

---

## 6. Spec Compliance Matrix (delta from round 2)

| Requirement | Scenario | Test | Round 2 | Round 3 |
|---|---|---|---|---|
| Sólo master revela | No se concede por descuido | `roles.service.spec.ts` (`create`/`update`/`syncPermissions`, all 3 paths) | ❌ FAILING (CRITICAL) | ✅ **COMPLIANT** (mutation-verified) |
| Autoría sellada | El listado no filtra | `audit-trail-reveal.e2e-spec.ts` WARNING-A.1/A.2/A.3 | ⚠️ PARTIAL | ✅ **COMPLIANT** |
| Autoría sellada | Filtrar por autor no revela | `audit-trail-reveal.e2e-spec.ts` WARNING-C.1 | ❌ UNTESTED | ✅ **COMPLIANT** |
| Autoría sellada | El autor se ve a sí mismo | `audit-trail-reveal.e2e-spec.ts` WARNING-C.2 | ❌ UNTESTED | ✅ **COMPLIANT** |
| Sólo master revela | Concedida a master (dos tablas) | `audit-trail-reveal.e2e-spec.ts` WARNING-A.6 (direct-SQL walk) | ❌ UNTESTED | ✅ **COMPLIANT** |
| Sólo master revela | Negada a operador y reporter | `audit-trail-reveal.e2e-spec.ts` WARNING-A.4/A.5 + pre-existing reporter test | ⚠️ PARTIAL | ✅ **COMPLIANT** |
| Sólo master revela | Caché invalidada | migration 0047 bumps `permission_version` (still no direct test) | ⚠️ PARTIAL | ⚠️ PARTIAL (unchanged — out of FIX-5/FIX-6 scope) |

All other 16 scenarios from round 2 remain ✅ COMPLIANT, unaffected by this round's
changes.

**Compliance summary**: **22/23 scenarios fully compliant** (up from 16/23), 1/23
partial (cache invalidation — non-blocking, unrelated to FIX-5/FIX-6), 0/23 untested,
0/23 failing.

---

## 7. Tasks completeness

`tasks.md`: 22/22 tasks still marked `[x]` (unchanged this round — the fix lives in
`fixes-required.md`/`verify-report.md`'s round-2→round-3 cycle, not in a new task).
The C.7 caveat noted in round 2 ("No se concede por descuido" not durable across all 3
mutation paths) is now resolved — code matches the task's original "estructural" claim.

**Note (SUGGESTION, non-blocking)**: `apply-progress.md` was not updated for this round
— it still reads as if the change shipped clean in round 1 (ronda 1, 2026-09-06,
"Estado de gates (medido)" section only lists the round-1 baseline). This is a
documentation-debt gap, not a code defect: a reader of `apply-progress.md` alone would
not know FIX-5/FIX-6 happened. Recommend appending a "Ronda 3" section before archive.

---

## 8. Can this be archived?

**Yes — no CRITICAL remains.** Both FIX-5 and FIX-6 are resolved and independently
confirmed by mutation testing in both directions (disable the guard → the tests that
claim to catch it actually fail, by name, with no false negatives or over-broad
failures). All three mutation paths into `roles.permissions` (`create`, `update`,
`syncPermissions`) are now guarded by the same `assertRevealOnlyForMaster`, evaluated
against the **resulting** name/permissions in `update()`'s case. Seeded role names are
now protected against rename-based privilege escalation, closing the same defect class
found in the sibling REG change.

All gates pass: lint 0 errors, typecheck exit 0, build exit 0, unit 109/989 exit 0, e2e
53/465 exit 0. The one remaining WARNING (cache-invalidation direct test) and one
SUGGESTION (`apply-progress.md` round-3 addendum) are both non-blocking and were already
flagged as non-blocking in round 2's "recommended, non-blocking" list before this round
started — they do not regress and do not need to gate archive.

**Recommendation**: proceed to `sdd-archive`.
