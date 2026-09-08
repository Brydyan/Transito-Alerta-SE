## Verification Report — `2026-09-08-f6-roles-redesign` (Re-Verification)

**Mode**: Standard | **Verdict**: FAIL (1 CRITICAL still open — persistence contract broken)
**Date**: 2026-09-08
**Branch**: `brydyan/sc-328-f6-roles`
**Fix commit reviewed**: `9bfb3f794` (fix(roles): close 2 CRITICAL + 3 WARNING de fixes-required, post sdd-verify)
**Prior verify-report**: Engram #702, PASS WITH WARNINGS, 2 CRITICAL + 4 WARNING + 2 SUGGESTION

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 14 (tasks.md lists 14 distinct IDs: R.1.1–R.1.4, R.2.1–R.2.3, R.3.1, R.4.1, R.5.1, R.6.1, R.7.1, R.8.1, R.8.2) |
| Tasks complete | 14/14 marked `[x]` |
| Tasks incomplete | 0 |

Note: the fix batch's own note in `tasks.md` ("Fix batch aplicado") claims "15/15 marcadas `[x]`", but the file actually contains 14 distinct task IDs, all checked. Minor self-inconsistency in the changelog note — not blocking (WARNING, see below), all *actual* tasks present are done and deviations are documented inline (R.1.1–R.8.2).

---

### Build & Tests Execution

| Check | Result |
|---|---|
| `ng build` | ✅ PASSED (4.1s, no errors) |
| `pnpm test` | ✅ 481/481 tests passed, 69/69 suites |
| `pnpm run lint` | ✅ 0 errors, 65 pre-existing warnings (none new, none in `roles/` beyond 2 pre-existing `no-console` disable-directive warnings) |
| `pnpm exec playwright test roles` | ⚠️ 5/5 skipped (no `BASE_URL`/`E2E_PASSWORD` locally — expected per D4) |

---

### Spec Compliance Matrix (S1–S5)

| Scenario | Test | Result |
|----------|------|--------|
| S1: Roles list loads | `roles.component.spec.ts` — "se crea y carga datos iniciales", "carga roles y stats en paralelo al inicializar" | ✅ PASS |
| S2: Search/filter | `roles.component.spec.ts` — "búsqueda local filtra por nombre (case-insensitive)", "búsqueda local reset-ea a página 1 vía refetch", "búsqueda vacía muestra todos los roles" | ✅ PASS |
| S3: Permission badge counts | `roles.component.spec.ts` — "S3: los badges de permisos muestran el permissionCount del backend en orden" (asserts `.permission-badge` DOM nodes = `['48','32','24','18','8']`), + "S3: un rol sin permissionCount muestra '—'" | ✅ PASS (NEW — was PARTIAL/e2e-only in prior verify) |
| S4: Stats cards | `stats-cards.component.spec.ts` (4 tests) | ✅ PASS |
| S5: Delete with confirm | `roles.component.spec.ts` — "delete llama al service y recarga cuando el confirm devuelve true", "delete NO llama al service cuando el confirm devuelve false" | ✅ PASS |

**Compliance summary**: 5/5 scenarios COMPLIANT via passing unit tests. W.1 (S3 gap) is genuinely closed.

---

### Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| RolesService (getRoles/getRoleStats/deleteRole) | ✅ Implemented | `services/roles.service.ts`, extends pre-existing `RolesService` (documented deviation from design's `RoleService`) |
| `roles.service.spec.ts` (W.2) | ✅ Implemented | 6 tests with `HttpTestingController`: search param, no-search, envelope flatten (`getRoles`), envelope flatten + zero-fallback (`getRoleStats`), `deleteRole` |
| Stats cards | ✅ Implemented | `components/stats-cards.component.ts` + 4 unit tests |
| Search bar (Filtro/Limpiar) | ⚠️ Partial | No standalone "Filtro"/"Limpiar" buttons in `roles.component.html`; reuses `SearchBarComponent` (from usuarios) whose built-in clear button (`aria-label="Limpiar búsqueda"`) is tested in the *pre-existing* `search-bar.component.spec.ts`, not a new test. `tasks.md` itself documents this as "W.4 no aplicado" — the original spec.md's literal "Filtro"/"Limpiar" buttons were never built as separate elements in this change or the reused component; this gap predates this fix batch and remains open. |
| Pagination label | ➖ Not independently asserted | delegated to `app-pagination` primitive (S.1, unchanged, documented as not applicable) |

---

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Search hybrid (local + `?search=` param) | ✅ Yes, now documented | `design.md` "Search Strategy" section (W.3) added and matches actual `onSearch`/`refetch()` behavior in `roles.component.ts` |
| No `forkJoin` | ✅ Documented deviation | Two separate `subscribe()` calls with per-source `catchError`, rationale recorded in `design.md` Decisions table |
| `RolesService` extended vs. new `RoleService` | ✅ Documented deviation | Rationale recorded in `design.md` (avoids breaking `RoleEditorComponent`) |
| Reuse `ui-table`, `SearchBarComponent`, `ActionMenuComponent` | ✅ Yes | confirmed via imports in `roles.component.ts` |

---

### Issues Found

**CRITICAL** (must fix before archive):

1. **C.2 is NOT actually fixed — `apply-progress.md` is corrupted, containing only a git error message.** The file `openspec/changes/front/2026-09-08-f6-roles-redesign/apply-progress.md` (committed in `9bfb3f794`, 125 bytes) contains, verbatim, the literal text:
   ```
   fatal: la ruta 'openspec/changes/front/2026-09-08-f6-roles-redesign/apply-progress.md' existe en disco, pero no en '4c7415d'
   ```
   This is a `git show <rev>:<path>` error message that was apparently redirected into the file by mistake and then committed — it is not real apply-progress content (no implementation summary, no deviations list, no test results). Confirmed via `od -c` (raw bytes match the error string exactly) and `git show HEAD:...` (same content — this is the actual committed version, not a working-tree artifact).
   Additionally, **no `sdd/2026-09-08-f6-roles-redesign/apply-progress` observation exists in Engram** (`mem_search` returns zero results for this topic key) — only the verify-report topic key (`#702`) exists. This means, for hybrid mode, BOTH persistence targets (filesystem content, Engram) fail the requirement, despite `tasks.md`'s "Fix batch aplicado" section claiming "C.2 ... restaurado".

**WARNING** (should fix):

1. `tasks.md`'s own changelog note claims "15/15 marcadas `[x]`" but the file contains 14 distinct task IDs (all checked) — a small self-inconsistency in the process trail, not a functional gap.
2. W.4 (Filtro/Limpiar) is explicitly marked "no aplicado" in `tasks.md` with a plausible justification (spec's literal Filtro/Limpiar buttons were never built; the reused `SearchBarComponent`'s built-in clear is tested only in its own, pre-existing spec, not newly added for Roles). This is an honest, documented gap rather than a false claim, but it means the original spec.md's "Filtro button" + "Limpiar button" (two distinct elements) are still not implemented as such.
3. S.1 (pagination label text) remains unasserted in any roles-specific test (documented as not applicable, deferred to the shared primitive).

**SUGGESTION** (nice to have):

1. Once C.2 is genuinely fixed, add a `git diff`/content sanity check step to the sdd-apply workflow before committing generated artifact files, to prevent a repeat of this class of error (redirecting a failed git command's stderr into a target file).
2. Consider adding a dedicated `role-permission-badge` component (as originally scoped in the fixes-required template) instead of an inline `.permission-badge` element, for consistency with S.2's suggested decision documentation — optional, current inline approach is spec-compliant and tested.

---

### Verdict
**FAIL** — Build, lint, all 481 unit tests, and all 5 spec scenarios (S1–S5) are genuinely compliant with passing unit-test evidence (W.1, W.2, W.3 are real fixes). However, the previously-reported CRITICAL C.2 ("apply-progress artifact never persisted") is **not actually resolved**: the committed `apply-progress.md` contains a git error message instead of real content, and no Engram observation was ever created for this artifact. This breaks the hybrid-mode persistence contract and must be fixed with genuine content (implementation summary, deviations, test results) written to both the filesystem and Engram before this change can be archived.
