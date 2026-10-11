# Apply Progress: User Form Departments & Hybrid Telegram Linking

**Change**: `2026-10-11-user-form-departments-telegram-hybrid`
**Mode**: Strict TDD
**Date**: 2026-10-11
**Status**: All tasks complete (21/21)

---

## 1. Tasks Implemented

### Phase 1 — Backend: `POST /api/users/me/telegram-link`

- **1.1** Exposed `POST /api/users/me/telegram-link` in `users.controller.ts` as `generateTelegramLink()`.
- **1.2** Role check: `req.user.roleName === 'reporter'` → throws `ForbiddenException(403)`. All other roles pass.
- **1.3** Calls `telegramLinkService.issueFor(userId)` then `telegramLinkService.composeDeepLink(token)`. Returns `{ telegram_link: string | null }`.
- **1.4** Added 4 unit tests in `users.controller.spec.ts` covering: staff allowed, reporter blocked, master allowed, null deep-link case.

### Phase 2 — Frontend Models and Services

- **2.1** Added `Department` interface, `SECTIONAL_ROLES`, `GLOBAL_ROLES` constants, `departmentId` field to `NewUserFormData` and `DEFAULT_NEW_USER_FORM`, `department_id` to `CreateUserJsonPayload` — all in `user.interface.ts`.
- **2.2** Updated `UsersService.getFormData()` to map `departments[]` from backend response (`organization_id` → `organizationId`). Return type updated to include `departments: ReadonlyArray<Department>`.
- **2.3** Added `telegram_chat_id?: string | null` to `UserProfile` interface in `user.service.ts`.
- **2.4** Added `generateTelegramLink(): Observable<{ telegram_link: string | null }>` calling `POST /users/me/telegram-link` in `user.service.ts`.
- **2.5** Updated `users.service.spec.ts` (renamed existing getFormData test, added departments test + empty departments fallback, updated createUserJson test to include `department_id`). Updated `user.service.spec.ts` with 3 new tests.

### Phase 3 — `NewUserFormComponent`

- **3.1** Added `departments = signal<ReadonlyArray<Department>>([])` and `filteredDepartments = computed(...)` filtering by `formData().organizationId`.
- **3.2** Updated `isFormValid` to require `departmentId` when role is sectional (`SECTIONAL_ROLES`). Replaced local `ROLES_REQUIRING_ORG` with imported `SECTIONAL_ROLES`.
- **3.3** Added `isGlobalRole = computed(...)` checking `GLOBAL_ROLES`. Template disables org/dept selects when `isGlobalRole()`, shows informational message.
- **3.4** Added `<select id="new-user-dept" data-testid="select-department">` in HTML section 3, disabled until org is selected or when global role.
- **3.5** `onOrganizationChange` now resets `departmentId: null` alongside `organizationId`.
- **3.6** Added `department_id: d.departmentId` to `onSubmit()` payload.
- **3.7** Updated spec: added `r-master` and departments to `fixtureLookups`; updated S1.1 to check `departments().length`; updated S6.1 to include `department_id: null`; updated "admin_org + org → válido" to include `departmentId`; added 16 new tests across departments, isGlobalRole, isFormValid, and onSubmit suites.

### Phase 4 — `ProfileActionCardsComponent`

- **4.1** Added 4th card "Notificaciones Telegram" with `send` icon. Injected `UserService` and `ToastService`, added `currentUser = toSignal(...)` and `isLinking = signal(false)`.
- **4.2** Badge renders "Vinculado" (green) when `telegram_chat_id` exists, "No configurado" when null/absent. Both have `data-testid="telegram-status"`.
- **4.3** `onLinkTelegram()` calls `userService.generateTelegramLink()`, opens URL via `window.open(link, '_blank')`.
- **4.4** On success with null link: warning toast. On error: error toast with `ToastService`.
- **4.5** Rewrote spec from scratch: 4 separate `describe` blocks to avoid Angular TestBed re-configuration error. 11 total tests covering layout, unlinked state, linked state, and click handler.

---

## 2. Blockers Found and Resolved

### B1 — Wrong path for user.service.ts (Tasks 2.3, 2.4)
- **Described**: Tasks referenced `frontend/src/app/features/profile/services/user.service.ts` — does not exist.
- **Real path**: `frontend/src/app/core/services/user.service.ts`
- **Resolution**: Used the real path for all edits.

### B2 — TelegramLinkService not injectable in UsersController
- **Described**: `TelegramModule` was not imported by `UsersModule`, so NestJS couldn't inject `TelegramLinkService` into `UsersController`.
- **Resolution**: Added `TelegramModule` to `UsersModule.imports`. `TelegramLinkService` was already exported from `TelegramModule` — no further change needed there.

### B3 — profile-action-cards.component.ts was purely presentational
- **Described**: Component had no constructor, no inject(), no service dependencies.
- **Resolution**: Added `inject(UserService)`, `inject(ToastService)`, `inject(DestroyRef)`. Added `currentUser = toSignal(this.userService.getCurrentUser())` and `isLinking = signal(false)`. Added `onLinkTelegram()` method with full Observable subscription.

### B4 — profile-action-cards.component.spec.ts `toBe(3)` breaks with 4th card
- **Described**: The original test expected 3 cards.
- **Resolution**: Rewrote the spec to use 4 separate `describe` blocks (avoiding TestBed re-instantiation error), changed `toBe(3)` to `toBe(4)`, and added 7 new Telegram-specific tests.

---

## 3. Minor Adjustments

### A1 — Remove duplicate local `ROLES_REQUIRING_ORG`
- **Decision**: Removed `const ROLES_REQUIRING_ORG = ['admin_org', 'operador_org'] as const` from `new-user-form.component.ts`. Imported `SECTIONAL_ROLES` from `user.interface.ts` instead. All usages updated.

### A2 — Section 6 "Canal de notificaciones" placeholder
- **Decision**: Left the disabled `<select title="Disponible en F7">` for the notification channel as-is. The design doesn't modify it; it's a pre-existing F7 placeholder. Documented here.

### A3 — profile-action-cards real path
- **Path used**: `frontend/src/app/features/profile/components/profile-action-cards.component.ts` (no subdirectory). This matches the real filesystem path.

---

## 4. Deviations from Design

1. **`generateTelegramLink` method name**: The spec says `getTelegramLink()` and the implementation guide says `generateTelegramLink()`. Used `generateTelegramLink()` throughout (matches the design D3/D4 semantics — it issues a new token each time).

2. **`telegram_link: string | null`**: `TelegramLinkService.composeDeepLink()` returns `string | null` (null when `botUsername` is not configured). The return type was preserved as `{ telegram_link: string | null }` — not just `string`. A null link triggers a warning toast in the frontend instead of opening a tab.

3. **`isFormValid` for sectional roles now also requires `departmentId`**: The original `isFormValid` only checked `organizationId` for `admin_org`/`operador_org`. Per D1, `departmentId` is also required. One pre-existing test ("rol admin_org + organización → válido") was updated to include `departmentId: 'd1'` to match the tightened requirement.

4. **Profile action cards spec structure**: Angular's `TestBed` cannot be re-configured after instantiation. Using nested `beforeEach` that calls `configureTestingModule` causes "test module already instantiated" errors. Split into 4 separate `describe` blocks (one per TestBed lifecycle) to work around this Angular testing constraint.

---

## 5. Contradictions Found Between Contract and Real Code

1. **`getFormData()` return shape**: The existing `users.service.spec.ts` test at line 55-57 asserted `data.organizations[0]` had `{ id, name }` but the actual service maps to `{ id, nombre }`. The test passed because the subscriber assertion was syntactically correct but the `name` field would be undefined at runtime. Updated the test to use `{ id, nombre }` (the actual mapped shape).

2. **`UsersService.uploadAvatar` path**: Pre-existing code uses `PATCH /api/users/:id/avatar` but the `UsersController` exposes `POST /api/users/me/avatar` (for self). The admin upload path uses `@Post('me/avatar')` in the controller, not `/:id/avatar`. This is a pre-existing deviation documented in previous apply-progress files and not in scope for this change.

---

## 6. CI Gate Results

| Gate | Result |
|------|--------|
| Backend typecheck (`tsc --noEmit`) | ✅ No errors |
| Frontend typecheck (`tsc --noEmit`) | ✅ No errors |
| Backend tests (full suite) | ✅ 1405 passed, 0 failed, 11 skipped (1416 total) |
| `users.controller.spec.ts` | ✅ 14/14 passed |
| `user.service.spec.ts` | ✅ 6/6 passed |
| `users.service.spec.ts` | ✅ 15/15 passed |
| `new-user-form.component.spec.ts` | ✅ 44/44 passed |
| `profile-action-cards.component.spec.ts` | ✅ 11/11 passed |
| Frontend targeted tests (76 total) | ✅ 76/76 passed |

---

## 7. TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1–1.4 | `users.controller.spec.ts` | Unit | ✅ 10/10 | ✅ Written | ✅ 14/14 | ✅ 4 cases (staff, reporter, master, null link) | ✅ Clean |
| 2.3–2.4 | `user.service.spec.ts` | Unit | ✅ 3/3 | ✅ Written | ✅ 6/6 | ✅ 2 cases (with/without telegram_chat_id) | ✅ Clean |
| 2.1–2.2 | `users.service.spec.ts` | Unit | ✅ 14/14 | ✅ Written | ✅ 15/15 | ✅ 2 cases (departments present/absent) | ✅ Clean |
| 3.1–3.7 | `new-user-form.component.spec.ts` | Unit | ✅ 32/32 | ✅ Written | ✅ 44/44 | ✅ multiple (filteredDepts, isGlobalRole, isFormValid, submit) | ✅ Clean |
| 4.1–4.5 | `profile-action-cards.component.spec.ts` | Integration | ✅ 4/4 | ✅ Written | ✅ 11/11 | ✅ 2 states (linked/unlinked) + click handler | ✅ Clean |

### Test Summary
- **Total tests written (new)**: 26 new tests
- **Total tests passing**: 76 frontend + 1405 backend = 1481
- **Layers used**: Unit (backend), Unit + Integration (frontend)
- **Approval tests** (refactoring): 0 — no pure refactoring tasks
- **Pure functions created**: `filteredDepartments`, `isGlobalRole`, `isFormValid` (all computed signals — effectively pure)
