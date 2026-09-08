## Verification Report — `2026-09-08-f6-usuarios-redesign`

**Change**: 2026-09-08-f6-usuarios-redesign
**Version**: N/A
**Mode**: Standard (frontend has no `strict_tdd` config resolved via sdd-init; `openspec/config.yaml` at repo root is scoped to `backend` only — no frontend-specific testing-capabilities entry was found in Engram, so verification proceeded in Standard Mode with real execution evidence)
**Verdict**: FAIL

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 22 |
| Tasks complete (per `tasks.md` checkboxes) | 0 |
| Tasks complete (per `apply-progress.md` status table) | 22 |
| Tasks incomplete | 0 (functionally) / 22 (per artifact-of-record) |

**Finding**: `tasks.md` has **0/22** items marked `[x]` — every checkbox is still `[ ]` — while `apply-progress.md`'s own status table marks all 22 as ✅. The artifact of record (`tasks.md`) was never updated to reflect completion. Code/test evidence below confirms most (not all) work was actually done, but the audit trail is broken.

---

### Build & Tests Execution

| Check | Result |
|---|---|
| `ng build` | ✅ Passed (4.4s, no errors) |
| `pnpm test` (Jest) | ✅ 460 passed / 0 failed (67 suites) |
| `pnpm run lint` (ESLint) | ✅ 0 errors / 63 warnings (pre-existing, unrelated to F6) — see flakiness note below |
| `pnpm exec playwright test users-list` | ➖ 7 skipped (expected — no `BASE_URL`/`E2E_PASSWORD` locally, per D4 of `e2e-test-user-and-credentials`) |

**Lint flakiness note**: The first `pnpm run lint` execution reported 8 errors across 3 F6 files (`action-menu.component.spec.ts`, `filter-bar.component.ts`, `search-bar.component.ts`) — `no-undef` on DOM types and unused imports (`FormControl`, `signal`) that do not exist in the current file contents (verified via direct `grep`/`Read`). Two subsequent clean re-runs (including one scoped only to `users-list/**`) produced 0 errors. This is very likely a transient type-aware ESLint parser race, not a real defect — but it is a CI flakiness risk worth investigating.

---

### Spec Compliance Matrix (S1–S8)

| Scenario | Test | Result |
|----------|------|--------|
| S1: Users list loads | `users-list.component.spec.ts > se crea y carga los datos iniciales`; `users-list.e2e.ts > S1` (skip, D4) | ✅ COMPLIANT |
| S2: Search filters locally | `users-list.component.spec.ts > búsqueda local filtra...`, `...case-insensitive`, `...búsqueda vacía`; `users-list.e2e.ts > S2` (skip) | ✅ COMPLIANT |
| S3: Role filter works | `users-list.component.spec.ts > onFilterChange guarda role/org en signals (backend los ignora por ahora)`; `users-list.e2e.ts > S3` (skip) | ❌ FAILING |
| S4: Organization filter works | `users-list.e2e.ts` explicitly **omits S4** ("duplica S3 sin nuevo comportamiento"); no unit test asserts filtered output | ❌ UNTESTED |
| S5: Status badges display | `users-list.component.spec.ts` (indirect, via `statusOf`); `users-list.e2e.ts > S5` (skip) | ⚠️ PARTIAL |
| S6: Pagination works | `users-list.component.spec.ts > onPageChange recarga del backend con la página nueva`; `users-list.e2e.ts > S6` (skip) | ✅ COMPLIANT |
| S7: Action menu works | `action-menu.component.spec.ts` (4 tests: view/toggle/edit/delete emit); `users-list.component.spec.ts > delete llama al service...`; `users-list.e2e.ts > S7` (skip) | ✅ COMPLIANT |
| S8: Error state — endpoint fails | `users-list.component.spec.ts > captura 500 del backend y enciende errorMessage`; `users-list.e2e.ts > S8` (skip) | ✅ COMPLIANT |

**Compliance summary**: 5/8 fully compliant, 1 partial, 2 failing/untested.

**S3 detail (why FAILING, not just partial/deviation)**: `onFilterChange()` in `users-list.component.ts` only writes `selectedRole`/`selectedOrg` signals — it never calls `loadUsers()` and there is no local filter applied to `visibleUsers()` by role/org either. `UsersService.getUsers()` has signature `getUsers(page, limit)` only — it does **not** accept `search`, `role`, or `org` params, contradicting `design.md`'s explicit signature `getUsers(page, limit, search, role, org)` and task `U.2.2` (marked ✅ in apply-progress but not actually implemented as specified). The unit test itself documents the gap in its own name ("...backend los ignora por ahora"). Critically, `frontend/e2e/users-list.e2e.ts` test `S3` mocks a **second** `/api/users` response with 1 row and asserts `rows.toHaveCount(1)` after selecting a role — but since the component never issues that second request, this assertion **will fail** the moment the test actually runs against a real backend (once CI has `BASE_URL`/`E2E_PASSWORD` per the `e2e-test-user-and-credentials` change). This is a latent CI failure, not just a documentation gap.

**S5 detail (why PARTIAL)**: Spec requires 3 states (Activo/Pendiente/Inactivo with distinct colors). Backend only models `isActive: boolean`, so only Activo/Inactivo are rendered — documented as a deviation in `apply-progress.md`, acceptable but incomplete vs. spec text.

---

### Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|--|--|--|
| SearchBar component (300ms debounce, clear X) | ✅ Implemented | `search-bar.component.ts` — `debounceTime(300)`, `distinctUntilChanged`, clear button |
| FilterBar component (role + org dropdowns, reset) | ✅ Implemented | `filter-bar.component.ts` — 2 selects + conditional reset button |
| UiTableComponent reuse | ✅ Implemented | Reused from F0 shared components, 7 `<th>` columns match spec |
| ActionMenuComponent (eye + 3-dot menu, click-outside close) | ✅ Implemented | `HostListener('document:click')` + `contains()` |
| 7-column table (Foto/Nombre/Email/Rol/Org/Estado/Acciones) | ⚠️ Partial | Columns present in markup, but **Organización column is hardcoded `—`** (`<td class="muted">—</td>`, line 89 of `users-list.component.html`) — never resolves `user.organizationId` against the already-loaded `organizations()` signal. Not documented as a deviation. |
| Status badges (Activo/Inactivo) | ✅ Implemented | `ui-badge` with `resuelto`/`cerrada` variants, driven by `statusOf(user)` |
| Pagination ("Mostrando X-Y de Z") | ✅ Implemented | `app-pagination` wired with `itemNameSingular="usuario"` / `itemNamePlural="usuarios"` |
| Header title "Administración de Usuarios" | ⚠️ Partial | Renders as kicker `"ADMINISTRACIÓN"` + title `"Usuarios"` (split), not the literal spec string. Subtitle text matches exactly. |
| Bottom cards (Políticas de Seguridad / Gestión de Organizaciones / Auditoría de Acceso) | ❌ Missing | Not present anywhere in `users-list.component.html`. Not mentioned in `apply-progress.md` deviations — silent omission of a spec-mandated layout section. |
| D7 — no `*hasPermission` in list | ✅ Implemented | Verified via grep: no `*hasPermission` directive in `users-list/` tree; buttons always visible in `ActionMenuComponent`; 403 handled via toast in `onDelete` |
| D6 — CSS tokens only (no hex literals) | ✅ Implemented (F6 scope) | No raw hex outside `var(--token, #fallback)` pattern in `users/` tree. Pre-existing, unrelated `css-tokens-policy.e2e.ts` regression (legacy `--border-color` var in `date-picker.component.css` / `_layout.css`) is out of F6 scope and was already failing before this change. |

---

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Local search | ✅ Yes | `visibleUsers` computed filters `users()` client-side by name/email/role |
| NO `*hasPermission` on list (D7) | ✅ Yes | Confirmed above |
| Backend pagination | ✅ Yes | `onPageChange` calls `loadUsers()` with new page |
| Reusable `ui-table` | ✅ Yes | Reused from F0, not duplicated |
| `getUsers(page, limit, search, role, org)` signature | ❌ Deviated | Actual signature is `getUsers(page, limit)` only — `search`, `role`, `org` were never added to the service despite `U.2.2` being marked complete. Root cause of S3/S4 failures above. |
| Component structure (`SearchBarComponent`, `FilterBarComponent`, `UiTableComponent`, `ActionMenuComponent`) | ✅ Yes | All 4 present as designed |

---

### Issues Found

**CRITICAL** (must fix before archive):
1. Organización column is hardcoded to `—` in `users-list.component.html` (line 89) — never resolves `user.organizationId` via the loaded `organizations()` signal. Fails spec's explicit column requirement and is not documented as a known deviation.
2. Role/Org filters (S3/S4) are non-functional: `onFilterChange()` stores signals but never reloads or locally filters the visible list, and `UsersService.getUsers()` doesn't accept `role`/`org` params despite `design.md`/task `U.2.2` requiring it. The `S3` e2e assertion (`rows.toHaveCount(1)`) will fail once run against a real backend in CI — it currently only "passes" because it's skipped locally.
3. The 3 bottom cards required by `spec.md` ("Políticas de Seguridad", "Gestión de Organizaciones", "Auditoría de Acceso") are entirely missing from the implementation and undocumented as a deviation.
4. `tasks.md` shows 0/22 tasks checked off despite `apply-progress.md` claiming full completion — the artifact of record does not reflect actual state, breaking the audit trail required for archive.

**WARNING** (should fix):
1. Header renders `"Usuarios"` + kicker `"ADMINISTRACIÓN"` instead of the literal spec title `"Administración de Usuarios"`.
2. `statusOf()` uses an unsafe type cast `(u as User & { isActive?: boolean })` — `isActive` is missing from the `User` model even though the backend does return it; works at runtime but is a type-safety smell.
3. `pendiente` status not modeled (backend limitation, already documented in `apply-progress.md`) — acceptable, reduces S5 to PARTIAL.
4. `pnpm run lint` showed a one-time flake (8 phantom errors in F6 files that don't reproduce) — investigate for CI stability, not currently blocking.
5. Pre-existing, out-of-scope `css-tokens-policy.e2e.ts` failure (`--border-color` legacy var in `date-picker.component.css`/`_layout.css`) — not introduced by F6, but currently red.

**SUGGESTION** (nice to have):
1. Add a unit/e2e assertion for the rendered Organización cell text and exact header title to prevent regressions like the ones found in this verification.
2. Either implement backend `role`/`org` query param support and wire `getUsers`/`onFilterChange` end-to-end, or rewrite/skip the `S3` e2e assertion to match actual (documented) behavior so it doesn't silently fail in CI later.

---

### Verdict
**FAIL**

460/460 unit tests pass, build is green, and lint is clean — but real-execution and structural review surfaced 4 CRITICAL gaps (unwired Organización column, non-functional role/org filters with a latent CI-breaking e2e assertion, missing bottom-cards layout section, and an unsynced `tasks.md`) that were not caught by the existing test suite and are not fully disclosed in `apply-progress.md`. Recommend routing back to `sdd-apply` to close these gaps before `sdd-archive`.
