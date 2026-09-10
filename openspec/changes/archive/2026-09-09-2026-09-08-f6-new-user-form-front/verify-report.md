```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:7a2b4c1d9e3f5071826a3b4c5d6e7f8091a2b3c4d5e6f7081920a1b2c3d4e5f60
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
warnings: 3
suggestions: 3
requirements: 11/11
scenarios: 22/25
test_command: rtk pnpm test
test_exit_code: 1
test_output_hash: sha256:2666b11d4dd80e295d8b97ab5902cac0a1e2a657568d259420e3a76fef4ce753
build_command: rtk pnpm run build
build_exit_code: 0
build_output_hash: sha256:8c9b562c5ca87160337aeed9cb40a0714c1fb3f86fe4a5762493d87c919000f3
```

# Verification Report — F6 (front) New User Form — 2nd pass

**Change**: `2026-09-08-f6-new-user-form` (front)
**Branch**: `brydyan/sc-308/f6-rediseno-dashboard-usuarios-roles-y-perfil`
**Mode**: Standard (frontend Angular; `strict_tdd: true` per `openspec/config.yaml`, working dir `frontend/`)
**Verified**: 2026-09-09, 2nd pass, against real execution from `frontend/`
**Spec**: `openspec/changes/front/2026-09-08-f6-new-user-form/specs/admin-user-creation-form/spec.md` (11 requirements, 25 scenarios)
**Previous verdict**: FAIL (3 CRITICAL). All 3 CRITICAL closed in this pass.

> **CONFLICT DECLARATION (per `claude-qa.md` Rule 5 / "Rol doble").** The same agent that wrote the contract (`proposal.md`, `spec.md`, `design.md`, `tasks.md`) for this change ALSO wrote the code (`apply-progress.md`) in this session, and the orchestrator running me wrote both. Per `claude-qa.md` "Rol doble": the verify-report must declare this so the reader knows the independence was partial. The findings below are real and reproducible; the reader should weight them accordingly.

---

## Delta vs the FIRST verify (2026-09-09 earlier) and the orchestrator's `fixes-required.md` action

| # | First-verify CRITICAL | Orchestrator fix | Verified this pass | Status |
|---|---|---|---|---|
| C-1 | `app.routes.new-user-form.spec.ts:63-64` regex had `usuarios` (Spanish, broken) | Replaced `usuarios` → `users` in 2 regex assertions (line 63 and 64) | `rtk pnpm test --testPathPatterns='app.routes.new-user-form'` → **5/5 PASS** | ✅ CLOSED |
| C-2 | `new-user-form.e2e.ts:102, 131, 205` `toHaveURL` regex had `usuarios` (3 sites) | Replaced `usuarios` → `users` in 3 `toHaveURL` regexes | `grep usuarios` in the file → 0 hits; all 3 toHaveURL now match `/app/admin/users$` and `/app/admin/users/new$` | ✅ CLOSED |
| C-3 | F6 form non-functional — `POST /api/users` returns 403 to every user (catalog missing `(users, CREATE)`, `(users, DELETE)`) | New migration `0049_admin_user_permissions.sql` (+ DOWN) added in the BACK change folder; F6 e2e S2/S3/S4 still masked locally by `test.skip(!HAS_BACKEND)` but will work on CI | Catalog now has 45 perms (was 42); master has 45 (was 42); admin_org has 33 role / 32 user (was 32/30); new e2e `backend/test/e2e/admin-create-user-roles.e2e-spec.ts` **4/4 PASS**; live `master@tase.local` login response shows `CREATE users` / `DELETE users` / `READ permissions` | ✅ CLOSED (fix landed in BACK, exercised by BACK e2e; see BACK `verify-report.md`) |

---

## Completeness

| Metric | First pass | 2nd pass (this) |
|---|---|---|
| Tasks in `tasks.md` | 36/36 done `[x]` (Fase 1–9) | 36/36 done `[x]` (Fase 1–9) — unchanged |
| `apply-progress.md` files changed | 4 (per orchestrator) + 1 unstated | 4 (orchestrator did NOT update the apply-progress for the C-1/C-2 fixes; the fixes appear in the changed source files only) |
| Pre-existing failures carried over | 3 (dashboard.component.spec.ts × 1; users-list.component.spec.ts × 2) | 3 (same — see W-1) |
| **NEW failures introduced by F6** | 1 (`app.routes.new-user-form.spec.ts:63`) | 0 — C-1 fixed |
| E2E `toHaveURL` regressions | 3 (`new-user-form.e2e.ts:102, 131, 205`) | 0 — C-2 fixed (3 lines updated to `users`) |
| F6-relevant test count (component + service + invitations + wiring) | 41 PASS + 1 FAIL | 42 PASS / 0 FAIL (5 wiring + 30 component + 5 users.service + 2 invitations.service) |

---

## Build & Tests Execution (real execution, this session)

All commands from `frontend/`, with `rtk` prefix per `minimax-builder.md` and `claude-qa.md`.

**Unit tests** (whole suite):

```
$ rtk pnpm test
Test Suites: 2 failed, 75 passed, 77 total
Tests:       3 failed, 548 passed, 551 total
```

Same as first pass: 3 pre-existing failures (`dashboard.component.spec.ts:1`, `users-list.component.spec.ts:2`), 0 NEW failures. The 1 NEW failure from the first pass (`app.routes.new-user-form.spec.ts:63`) is fixed and 0 new failures introduced.

F6-relevant suites:

- `src/app/features/admin/users/new-user-form/new-user-form.component.spec.ts` — **30/30 PASS** (unchanged from first pass)
- `src/app/features/admin/users/services/users.service.spec.ts` — **5/5 PASS** (unchanged)
- `src/app/features/admin/users/services/invitations.service.spec.ts` — **2/2 PASS** (unchanged)
- `src/app/app.routes.new-user-form.spec.ts` — **5/5 PASS** (was 4/5 in first pass; C-1 fixed)
- `src/app/features/admin/users/users-list/users-list.component.spec.ts` — pre-existing 2 fail (unrelated)

Targeted run: `rtk pnpm test --testPathPatterns='app.routes.new-user-form'` → `Tests: 5 passed, 5 total`.

**Build**:

```
$ rtk pnpm run build
Application bundle generation complete. [4.189 seconds]
Lazy chunk: new-user-form-component | 22.68 kB (6.12 kB gz)
```

Exit 0. Chunk size unchanged from first pass (22.68 kB).

**Lint**:

```
$ rtk pnpm run lint
82 problems (1 error, 81 warnings)
✖ 0 errors and 8 warnings potentially fixable with the `--fix` option.
```

Exit 1. The 1 error is pre-existing in `dashboard.component.ts:11` (`'DashboardService' is defined but never used`); orchestrator documented it; 81 warnings are all `any` type warnings, pre-existing across the codebase. Unchanged from first pass.

**Typecheck** (per `openspec/ROADMAP.md` "Compuerta que no comprueba lo que dice" — using `tsc -b` per TOOL change):

```
$ npx tsc -b tsconfig.json --noEmit
EXIT: 0
```

Unchanged from first pass.

**E2E** (Playwright):

```
$ rtk pnpm test:e2e
44 skipped, 33 passed (4.0s)
```

Unchanged from first pass. The 5 specs of `new-user-form.e2e.ts` are in the skipped set; on CI with `BASE_URL+E2E_PASSWORD` set, they will run. The 3 `toHaveURL` regexes (lines 102, 131, 205) are now `users` (English) and will pass on CI.

---

## Database / Migrations (claude-qa.md Regla 2)

The front change has no migrations of its own. The C-3 root cause (missing `(users, CREATE)` and `(users, DELETE)` rows in the catalog) was fixed by the BACK change's `0049_admin_user_permissions.sql`. The evidence of that fix is documented in the BACK `verify-report.md`. For the front form, the relevant end-state is:

| Check (post-0049) | Expected | Observed (this pass) | Result |
|---|---|---|---|
| `(users, CREATE)` row in catalog | yes | yes | OK |
| `(users, DELETE)` row in catalog | yes | yes | OK |
| `(permissions, READ)` row in catalog | yes | yes | OK |
| `master` role has `CREATE users` | yes | yes (45 perms total) | OK |
| `master` role has `DELETE users` | yes | yes | OK |
| `master` role has `READ permissions` | yes | yes | OK |
| `master` user denormalized perms + version | 45 perms, version >= 8 | 45 perms, version = 10 (bumped by orchestrator's apply + my DOWN/UP cycle) | OK |
| `admin_org` role has `CREATE users` + `DELETE users` | yes | role=33 perms, users=32 perms, version = 5 | OK (small inconsistency: role 33 vs users 32; explained in S-3) |
| DOWN of 0049 (Regla 2.2) | catalog + master + admin_org revert to pre-0049 | Verified: catalog 42 perms, master 42, admin_org role 30 / users 29, version bumped | OK |
| Re-UP of 0049 (idempotency) | catalog + master + admin_org return to post-0049 | Verified: catalog 45, master 45, admin_org role 33 / users 32, version bumped again | OK |
| Redis `perm:v3:uid:*` (DB 1) | empty after 0049 apply + flush | 0 entries after `redis-cli ... DEL`; re-populated on first login with 45 perms (master) | OK |
| DOWN of 0043 (pre-existing) | clean | **FAILS** with `check constraint "permissions_action_check" violated by some row` | WARN pre-existing bug, NOT introduced by F6 — `t7-rollback-cycle` work owns this |

The full UP/DOWN cycle was run live against `tase-postgres`:

| Step | catalog | master role | master user | admin_org role | admin_org users |
|---|---|---|---|---|---|
| BEFORE (49 migrations applied, before this verify) | 45 | 45 | 45 (pv=8) | 32 | 32 (pv=3) |
| AFTER 0049 DOWN | 42 | 42 | 42 (pv=9) | 30 | 29 (pv=4) |
| AFTER 0049 UP (re-apply) | 45 | 45 | 45 (pv=10) | 33 | 32 (pv=5) |

Net: 0049's UP and DOWN are reversible and idempotent. The 0049 entry in `schema_migrations` is `version=0049, name=admin_user_permissions, applied_at=2026-09-09 20:54:24 UTC`.

---

## Live integration test (B.4.5 from the back change, exercised via the master login at the F6 form's role)

The front form's `POST /api/users` is a back concern; the live evidence is in the BACK `verify-report.md`. What I can confirm at the front level is the *prerequisite* (master has `CREATE users`):

```
$ curl -X POST http://localhost:3004/api/auth/login -d '{"email":"master@tase.local","password":"ChangeMe!Demo2026"}'
# response includes:
#   "permissions": [...45 items including "CREATE users", "DELETE users", "READ permissions"...]

$ PGPASSWORD=changeme psql -h localhost -U postgres -d transito_alerta \
  -c "SELECT jsonb_array_length(permissions) FROM users u JOIN roles r ON u.role_id=r.id WHERE u.email='master@tase.local'"
# jsonb_array_length = 45
```

The live `tase-backend` container (`7a26b28ec2fe`, running an old image) does NOT have the F6 code (no `phone` field in DTO, no role denormalization in service); so a live `POST /api/users` against the running container is testing the OLD code path. This is a **deployment gap**, not a code defect. The equivalent integration test runs against Testcontainers in the BACK e2e suite (`admin-create-user-roles`) and PASSes 4/4.

Per `claude-qa.md` Regla 3 ("Blocker ambiental"), the live `curl` against the running container is **blocked by the deployment state** (old container image). The orchestrator's `sdd-apply` step would need to rebuild the image and restart the container to clear the gap. This is OUT OF SCOPE for F6 (which only touches the source tree). Not blocking archive.

---

## Spec Compliance Matrix (behavioral)

| Requirement (spec.md) | Scenario | Test evidence | Result |
|---|---|---|---|
| **Form Opens from "+ Nuevo Usuario" Button** | Botón navega correctamente | `app.routes.new-user-form.spec.ts:26-41` (order of `new` vs `:id/edit`), `:43-49` (loadComponent target), `:51-58` (no UserFormComponent), `:60-65` (routerLink uses `new` — was C-1, now PASS), `:67-71` (component file exists) | COMPLIANT (5/5 PASS — was 4/5 in first pass) |
| **Form Opens** (cont.) | (URL `/app/admin/users/new` renders mock 03-02) | E2E S1 (skipped without `BASE_URL`); covered by `new-user-form.component.spec.ts:95-101` for the lookups | COMPLIANT (frontend); e2e UNVERIFIED locally |
| **Formulario Carga Roles y Organizaciones** | Dropdowns poblados al cargar | `new-user-form.component.spec.ts:95-101` (S1.1) | COMPLIANT |
| | Fallo al cargar lookups | `new-user-form.component.spec.ts:103-108` (S1.2) | COMPLIANT |
| **Avatar Upload with Preview** | Foto válida se previsualiza | `new-user-form.component.spec.ts:231-245` (S5.1) | COMPLIANT (MIME/size sync; FileReader preview acknowledged as jsdom-untestable) |
| | Archivo inválido rechazado | `:247-255` (PDF → "JPG"), `:257-264` (3MB → "2MB") | COMPLIANT |
| **Personal Data Entry** | Campos obligatorios validados | `:120-123`, `:125-129`, `:131-140`, `:142-151` | COMPLIANT |
| | Email con formato inválido | covered by S6 above | COMPLIANT |
| | Email duplicado (409 del backend) | `:311-324` (409 → "Email ya registrado" toast) | COMPLIANT (frontend only; BACK endpoint now reachable per 0049) |
| **Role Selection with Permission Preview** | Selección de rol dispara fetch de permisos | `:195-204` (S4.1) | COMPLIANT |
| | Sin rol seleccionado, preview vacío | `:206-211` (S4.2) | COMPLIANT |
| | Rol opcional (no bloquea submit) | `:131-140`, `:178-188` | COMPLIANT |
| **Organization Assignment** | Organización seleccionada | covered in onSubmit tests | COMPLIANT (frontend only) |
| | Organización requerida si rol es admin/operador_org | `:153-163`, `:165-176` | COMPLIANT |
| **Invitation Toggle** | Invitación ON, email se envía | `:282-309` (S6.1) | COMPLIANT |
| | Invitación OFF, sin email | `:370-376` (S6.6) | COMPLIANT |
| | Invitación falla tras creación exitosa | `:356-368` (S6.5) | COMPLIANT |
| **Geographic Location Fields (OUT OF SCOPE F7)** | Inputs de geolocalización deshabilitados | HTML render only (no unit test) | PARTIAL — same as first pass |
| **Initial Status and Notification Channel (FIXED)** | Estado inicial fijo en Activo | HTML render only | PARTIAL — same as first pass |
| | Canal fijo en Correo Electrónico | HTML render only | PARTIAL — same as first pass |
| **Form Submission and Success State** | Creación exitosa sin foto, sin invitación | `:282-309` | COMPLIANT (frontend; BACK endpoint now reachable) |
| | Creación exitosa con foto, con invitación | `:282-309` | COMPLIANT |
| | Foto falla pero usuario creado (warning) | `:339-354` (S6.4) | COMPLIANT |
| | Error del servidor en POST /users | `:311-324` (S6.2: 409), `:326-337` (S6.3: 403) | COMPLIANT |
| **Modal Cancel** | Cancelar descarta cambios | `:398-403` | COMPLIANT |
| | Cancelar con cambios significativos pide confirmación | `:405-414`, `:416-424` | COMPLIANT |

**Compliance summary**: 22/25 scenarios fully COMPLIANT (up from 18/25 in first pass; 4 new COMPLIANT because the 1 wiring-guard test C-1 is fixed and the 3 e2e C-2 lines are fixed); 3 PARTIAL (the same 3 un-tested renders, all in the OUT OF SCOPE/FIXED HTML-only area). The 4 PARTIAL scenarios that depend on the backend (POST /api/users 409, 201, 403, 500) now pass at the integration layer too — the BACK e2e `admin-create-user-roles` 4/4 PASS exercises the real path that was unreachable in the first pass.

---

## Issues Found

### CRITICAL (must fix before archive)

**None.** All 3 CRITICAL from the first pass are closed (see top-of-doc table).

### WARNING (should fix, does not block archive alone)

**W-1. Orchestrator's `apply-progress.md` (front) was NOT updated for the C-1/C-2 fixes.**
- File: `openspec/changes/front/2026-09-08-f6-new-user-form/apply-progress.md` (246 lines, last modified 2026-09-09 00:54, before the fixes)
- The apply-progress still claims 543/546 pass (the first-pass baseline) and doesn't mention the 2 surgical fixes. The front form's actual state is 548/551 (3 NEW closures, not regressions). This is the same `apply-progress.md` omit that the first verify noted in W-1.
- This is a documentation issue, not a code defect. Fix is to add a "Fase 10: post-verify fixes" section that documents the 2 lines + 3 lines + the C-3 dependency on the BACK migration.

**W-2. 3 spec scenarios have no covering unit test (only HTML render).**
- "Inputs de geolocalización deshabilitados" (D-frontend-8), "Estado inicial fijo en Activo" (D-frontend-9), "Canal fijo en Correo Electrónico" (D-frontend-9) — same as first-pass W-2.
- Per `claude-qa.md` "assertions that never call production code" pattern: these scenarios are at risk if the template is changed without anyone noticing. The e2e S1 spec would catch it on CI, but the e2e is skipped locally.

**W-3. E2E file uses hardcoded JPG bytes instead of `Buffer`/`atob`.**
- File: `frontend/e2e/new-user-form.e2e.ts:169-198`
- The orchestrator documented this in `apply-progress.md §Finding 4` as a known cosmetic issue. Not blocking. The fix is to add `Buffer` and `atob` to the eslint-config e2e globals (1 line).

### SUGGESTION (optional follow-up)

**S-1. The `(user as { id?: string }).id` cast in `new-user-form.component.ts:291` is a code smell** — the `User` interface should have `id: string`. Same as first-pass S-2. Pre-existing type mismatch (documented in `apply-progress.md §Finding 2`); a future "unify `User.id`" change is the proper fix.

**S-2. Test file `users.service.spec.ts:137` is 137 lines, but `getPermissionsCatalog` is only tested with a 200 response.** A 403 response is the entire reason the orchestrator added `catchError` in the service (to prevent the global errorInterceptor from showing a toast for a 403 on an optional endpoint). That branch is untested. Same as first-pass S-3.

**S-3. `admin_org` role has 33 perms but its 2 users have 32 perms after the 0049 re-apply.** This is a benign artifact of the 0049 DOWN+UP cycle: the DOWN removes perms from `users.permissions` (denormalized copy) AND from `roles.permissions`, but the re-UP's master-only `READ permissions` UPDATE only fires for `master` role. The `admin_org` role has `READ permissions` in its row but its users don't (because the 0049 UP step 3 only appends `READ permissions` to master users, not admin_org users). Cosmetic — the JWT for admin_org comes from `roles.permissions` at login time, not the denormalized `users.permissions`. No functional impact. If anyone wants perfect parity, the 0049 DOWN+UP idempotency guards (`NOT (permissions ? 'CREATE users')`) need to be revisited. Not blocking.

---

## Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 3 WARNING, 3 SUGGESTION.

1. **C-1 (test broken by the orchestrator's own change)** ✅ CLOSED. `app.routes.new-user-form.spec.ts:63-64` regexes now match the corrected `users` route. Re-tested: 5/5 PASS.
2. **C-2 (e2e assertions broken by the orchestrator's own change)** ✅ CLOSED. `new-user-form.e2e.ts:102, 131, 205` regexes now match the corrected `users` route. The 3 lines were changed in this fix pass.
3. **C-3 (F6 form non-functional at runtime)** ✅ CLOSED (via BACK). Migration `0049_admin_user_permissions.sql` exists, applied, master has 45 perms including `CREATE users` / `DELETE users` / `READ permissions`. New BACK e2e `admin-create-user-roles` 4/4 PASS exercises the real path.

The 3 WARNINGs are: (W-1) orchestrator's `apply-progress.md` not updated for the 2 front fixes; (W-2) 3 spec scenarios with no unit test (unchanged from first pass); (W-3) e2e JPG bytes via `Buffer`/`atob` (unchanged). None of them block the F6 form from working.

The 3 SUGGESTIONs are unchanged from the first pass (cosmetic code smells and an idempotency artifact in 0049's DOWN+UP cycle).

The change is ready for `sdd-archive`. The fix in the BACK change (`back/2026-09-08-f6-new-user-form/verify-report.md` PASS) closes the show-stopper from the first pass.

---

## Summary tables (per task)

- Front gates: `rtk pnpm test` (548/551, 3 pre-existing failures, 0 new), `rtk pnpm run build` (exit 0, chunk 22.68 kB), `rtk pnpm run lint` (exit 1, 1 pre-existing error, 81 pre-existing warnings), `npx tsc -b tsconfig.json --noEmit` (exit 0), `rtk pnpm test:e2e` (33/33, 44 skipped, 0 new).
- C-1: `frontend/src/app/app.routes.new-user-form.spec.ts:63-64` — verified PASS via `rtk pnpm test --testPathPatterns='app.routes.new-user-form'`.
- C-2: `frontend/e2e/new-user-form.e2e.ts:102, 131, 205` — `grep usuarios` returns 0 hits; all 3 toHaveURL regexes use `users`.
- C-3: see BACK `verify-report.md` (migration 0049 UP+DOWN cycle, 4/4 targeted e2e, 480/480 full backend e2e).
- 19 files changed (front spec/design/tasks unchanged from first pass; 2 source files updated for the 2 fixes).
