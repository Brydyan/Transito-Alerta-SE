# Verify Report: F6 Perfil Redesign

**Change**: `2026-09-08-f6-perfil-redesign`
**Branch inspected**: `brydyan/sc-308/f6-rediseno-dashboard-usuarios-roles-y-perfil` (contains commit `ae71fa87d feat(f6): rediseño de Perfil sobre primitivos F0`)
**Mode**: Standard verify (project-level strict_tdd applies to `backend/`; frontend has no cached testing-capabilities entry — treated as Standard for this report, static+runtime evidence gathered anyway)
**Verified**: 2026-09-08

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 9 phases / ~20 checkbox items |
| Tasks complete | 0 (all boxes remain `[ ]` in `tasks.md`) |
| Tasks incomplete | 20 (all) |

`tasks.md` was never checked off despite the feature being implemented and committed (`ae71fa87d`). No `apply-progress.md` exists for this change in the filesystem or in Engram (`mem_search("sdd/2026-09-08-f6-perfil-redesign/apply-progress")` → no results). This breaks the SDD audit trail: there is no record of which decisions were made during apply, only inline code comments referencing an "apply-progress.md" that does not exist (e.g. `profile.component.ts` comment "Ver apply-progress.md — D1 de esta fase").

**CRITICAL** — tasks.md not updated + apply-progress artifact missing.

---

### Build & Tests Execution

**Build** (`ng build` from `frontend/`): PASSED — completed in 6.0s, `profile-component` lazy chunk emitted (19.44 kB / 5.38 kB transfer).

**Tests** (`pnpm test` → jest, from `frontend/`): PASSED
```
Test Suites: 72 passed, 72 total
Tests:       501 passed, 501 total
Time:        5.23 s
```
501 ≥ 480 expected. All profile-related suites (`profile.component.spec.ts`, `profile-photo-uploader.component.spec.ts`, `profile-action-cards.component.spec.ts`) pass — but see "Spec Compliance" below: these tests mock `UsersService` entirely and therefore cannot detect the integration breakage found in Static Analysis.

**Lint** (`pnpm run lint`): exit code 0 — 65 warnings (pre-existing `no-explicit-any` / unused-eslint-disable across the codebase, none new to this change), 0 errors.

**E2E** (`pnpm exec playwright test profile`): 7/7 tests **skipped** (expected, D4 — `login()` requires `BASE_URL` + `E2E_PASSWORD`, not set locally). This is the exact test suite that would have caught the integration bugs below if run against a live backend/staging.

**Coverage**: Not run separately (no coverage threshold configured for frontend).

---

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| S1 | Profile loads, fields pre-populated | `profile.component.spec.ts > se crea y carga los datos del usuario` | ⚠️ PARTIAL — passes only because `UsersService` is mocked. Against a real backend this call is broken (see Static Analysis #1). |
| S2 | Edit personal info, save | `profile.component.spec.ts > onSubmit exitoso...`, `e2e/profile.e2e.ts:44` (skipped) | ⚠️ PARTIAL — unit test passes against mock; real backend would silently no-op the save (see Static Analysis #2) and never persist the avatar (Static Analysis #3). |
| S3 | Validation — nombre required | `profile.component.spec.ts > valida nombres requeridos`, e2e S3 (skipped) | ✅ COMPLIANT |
| S4 | Phone auto-formats to "(+593) 99 999 9999" as user types | `profile.component.spec.ts > valida teléfonos con prefijo ecuatoriano` | ❌ UNTESTED / NOT IMPLEMENTED — no masking/auto-format exists; only post-hoc validation. The e2e file itself documents this gap in a code comment: "S4: Phone format (auto-applied — verificado via form, no máscara)". |
| S5 | Upload photo, preview updates | `profile-photo-uploader.component.spec.ts`, e2e S5 (skipped) | ⚠️ PARTIAL — preview (client-side FileReader) works and is tested; actual upload to backend is broken (Static Analysis #3), and the oversized/invalid-file rejection path (task P.3.1 "Error for file size > 0.78 MB") has no user-facing error and no test exercising `onFileChange` with an oversized file (only the `MAX_BYTES` constant value is asserted). |
| S6 | Error handling (500) | `profile.component.spec.ts > onSubmit 500...`, e2e S6 (skipped) | ✅ COMPLIANT (toast + form retains values) |
| S7 | Email readonly | `profile.component.spec.ts > email es readonly...`, e2e S7 (skipped) | ✅ COMPLIANT |

**Compliance summary**: 3/7 fully compliant, 3/7 partial (real integration untested/broken), 1/7 not implemented as specified.

---

### Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|---|---|---|
| S1 load | ⚠️ Partial | See CRITICAL #1 below |
| S2 save | ⚠️ Partial | See CRITICAL #2 below |
| S3 validation | ✅ Implemented | |
| S4 phone mask | ❌ Missing | Validator-only, no auto-format |
| S5 upload | ⚠️ Partial | See CRITICAL #3 below |
| S6 error state | ✅ Implemented | |
| S7 readonly email | ✅ Implemented | |

---

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Reactive Form | ✅ Yes | `FormBuilder.group` with validators |
| Phone mask (design: "Auto-format per region") | ❌ Deviated | Only a custom validator (`ecuadorPhoneValidator`) was built; no masking/auto-format, contradicting both `design.md`'s decision table and spec S4 |
| Upload separate (design: photo + form independent operations) | ⚠️ Deviated | Implementation merges both into a single `PATCH /users/me` multipart call in `updateMe()`, rather than two calls (`updateProfile` PATCH + `uploadProfileImage` POST). Simplification is reasonable in principle, **but** it targets the wrong backend endpoint for the avatar (see CRITICAL #3) |
| Readonly email | ✅ Yes | |
| No password in this form | ✅ Yes | |
| `UserService.getCurrentUser()` / `.updateProfile()` / `.uploadProfileImage()` against `/users/me` GET/PATCH and `/users/me/profile-image` POST | ❌ Deviated | Implementation reuses the existing admin `UsersService` (`getUserById(id)` → `GET /users/:id`, `updateMe(payload, file)` → `PATCH /users/me`). No new `UserService` was created; no `/users/me/profile-image` endpoint is used at all. This deviation is the root cause of CRITICAL #1–#3 |
| File Changes table (design implies `frontend/src/app/features/catalogs/profile/...` per tasks.md P.1.1) | ⚠️ Deviated | Actual path is `frontend/src/app/features/profile/` (existing pre-F6 route, not under `catalogs/`). Functionally fine (route `/app/profile` unchanged), but tasks.md was not corrected to match |

---

### Issues Found

**CRITICAL** (must fix before archive):

1. **Profile load will fail against the real backend (NaN → 400).** `ProfileComponent.ngOnInit()` does `this.userId = Number(currentUser.id)` (`frontend/src/app/features/profile/profile.component.ts:138`). `AuthService.currentUser().id` is a UUID **string** (`frontend/src/app/core/models/auth.model.ts:67`, populated from backend `user_id` — also a UUID). `Number(<uuid-string>)` evaluates to `NaN`. This is passed to `UsersService.getUserById(NaN)` → `GET /api/users/NaN`. The backend route `GET /users/:id` (`backend/src/modules/users/users.controller.ts:89`) uses `@Param('id', ParseUUIDPipe)`, which will reject `"NaN"` with `400 Bad Request`. In production this means every real user hitting `/app/profile` will see the `"Error al cargar el perfil."` toast and a permanently-loading/blank form — the page is non-functional. Mocked unit tests pass because `UsersService.getUserById` is stubbed with `jest.fn()`.

2. **Save silently no-ops on the real backend (field name mismatch).** `onSubmit()` builds `payload = { email, nombres, apellidos, telefono }` (`profile.component.ts:179-184`) and calls `UsersService.updateMe()`, which PATCHes `/users/me` as `multipart/form-data` with those exact keys (`frontend/src/app/features/admin/users/services/users.service.ts:48-64`). The backend's `PATCH /users/me` controller (`backend/src/modules/users/users.controller.ts:52`) binds `@Body() dto: UpdateProfileDto`, whose fields are `first_name`, `last_name`, `phone` (English, snake_case — `backend/src/modules/users/dto/update-profile.dto.ts`). None of the frontend's field names match. Additionally, the global `ValidationPipe` uses `whitelist: true, forbidNonWhitelisted: true` (`backend/src/main.ts:75-79`) — combined with the endpoint having **no** `FileInterceptor`/multer wiring to parse `multipart/form-data` in the first place, the request body will not populate the expected fields, so the update is effectively a no-op (or a 400, depending on how Nest handles the unparsed multipart body). Existing backend e2e coverage for this route (`backend/test/e2e/t7-domain-columns.e2e-spec.ts:97-113`) only exercises JSON bodies with `{ phone: ... }`, confirming the contract the frontend fails to match.

3. **Avatar never uploads.** The backend's actual avatar endpoint is `POST /users/me/avatar` with `@UseInterceptors(FileInterceptor('avatar'))` (`backend/src/modules/users/users.controller.ts:64-70`, field name `avatar`). The frontend's `updateMe()` instead appends the file under the field name `'file'` to the `PATCH /users/me` FormData body (`users.service.ts:61-64`) — wrong endpoint, wrong field name, wrong HTTP verb. Photo upload (S5's "on Guardar Cambios, photo uploads via multipart") cannot succeed against the real backend.

4. **`GET /users/:id` used for self-profile load requires `READ users` permission the current user may not have.** `adminShow` (`backend/src/modules/users/users.controller.ts:89-92`) is decorated `@RequirePermission('READ')`, which `PermissionGuard` resolves to `READ users` (resource inferred from route's first path segment). This endpoint is intended for admins browsing other users, not for self-service profile viewing. A regular authenticated user without `READ users` permission will get `403 Forbidden` loading their own profile — directly contradicting the design's own stated goal ("el perfil es universal para usuarios autenticados... Sin `*hasPermission`"). The correct self-service endpoint, `GET /users/me` (no permission guard, `users.controller.ts:39-42`), exists and was not used.

5. **Tasks not marked complete / `apply-progress.md` missing** (see Completeness section). Blocks the SDD audit trail even though code exists.

**WARNING** (should fix):

1. **S4 (phone auto-format) not implemented.** Spec explicitly requires the input to auto-format as the user types (e.g. typing "593" formats to "(+593) 99 999 9999"). Only a submit/blur-time validator (`ecuadorPhoneValidator`) exists — no live masking. `design.md`'s own decision table calls for this ("Phone mask: Auto-format per region"), so this is a decision the team made and did not deliver, not just a spec-writer aspiration.
2. **Oversized/invalid-file uploads fail silently with no user feedback.** `ProfilePhotoUploaderComponent.onFileChange()` (`profile-photo-uploader.component.ts:227-250`) returns early without emitting any signal, event, or error when a file exceeds `MAX_BYTES` (800,000) or has an invalid MIME type — the component's own code comment admits it deliberately does not surface an error ("no emitimos... El componente no inyecta ToastService"), and the parent `ProfileComponent` also does not wire up any handling for this case. Task P.3.1 explicitly calls for "Error for file size > 0.78 MB." No test exercises this path through `onFileChange` — the only related test asserts the static `MAX_BYTES` constant value, not actual rejection behavior.
3. **`lastUpdatedAt` never reflects a real prior save.** Per spec, "Última actualización: ..." should show on load (mock shows a real prior timestamp). The backend doesn't expose this field, so the frontend only sets `lastUpdatedAt` in-memory after a successful save in the current session, and hides the line entirely (`@if (lastUpdatedAt())`) before any save happens in that session. Documented in code as an intentional gap ("no viene del backend"), but the underlying backend limitation isn't tracked anywhere else in this change's artifacts.
4. `tasks.md` P.1.1 specifies `frontend/src/app/features/catalogs/profile/`; actual location is `frontend/src/app/features/profile/` (pre-existing route/folder reused). Not corrected in tasks.md.
5. Design's dedicated `UserService` (`getCurrentUser`/`updateProfile`/`uploadProfileImage`) was not created; the pre-existing admin `UsersService` was reused instead, with different method/endpoint shapes than documented in `design.md`. This is the structural root of CRITICAL #1–#4 above — even if the field-name/permission bugs are fixed, this deviation should be explicitly re-approved or `design.md` updated to match reality.

**SUGGESTION** (nice to have):

1. Add an integration/e2e test that runs against a real (or Testcontainers-backed) backend for at least the S2 save + S5 upload paths — the current mock-only unit tests cannot catch endpoint/field-name contract mismatches, which is exactly what happened here.
2. Consider adding a lightweight contract test (e.g., a shared DTO/type checked at build time, or a Pact-style contract) between `UpdateUserPayload` (frontend) and `UpdateProfileDto` (backend) to prevent silent field-name drift.

---

### Verdict

**FAIL**

Build, lint, and the full (mocked) unit test suite all pass, and 3/7 spec scenarios are genuinely solid (S3, S6, S7). However, static cross-referencing of the frontend implementation against the actual backend controllers/DTOs it calls reveals that the two core happy-path scenarios — **S1 (load profile)** and **S2 (save profile) / S5 (upload photo)** — are broken end-to-end against the real backend: profile load 400s on a `NaN` UUID param, save silently fails to persist due to field-name mismatch (`nombres/apellidos/telefono` vs `first_name/last_name/phone`), and avatar upload hits an endpoint that cannot receive it. A regular non-admin user would additionally get `403 Forbidden` just loading their own profile due to reuse of an admin-gated endpoint. None of this is caught by the existing test suite because `UsersService` is fully mocked in unit tests and the only e2e coverage (which would catch it) is skipped locally (D4, no staging credentials). This must not be archived until CRITICAL #1–#4 are fixed and validated against a live/staging backend.
