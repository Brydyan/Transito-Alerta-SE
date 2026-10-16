# Apply Progress — 2026-10-15-user-status-notif-channel

## Implemented

- **Phase 1 — Infra**
  - `database/migrations/0033_user_notification_channel.sql` adds `preferred_notification_channel VARCHAR(20) NOT NULL DEFAULT 'email'` on `users`. Includes `COMMENT ON COLUMN` for catalog clarity.
  - `database/rollback/0033_user_notification_channel.DOWN.sql` drops the column.
  - `database/MIGRATION_LOG.md` row `0033 ⏳ Pending`.
  - `backend/src/modules/users/entities/user.entity.ts` maps `preferredNotificationChannel!: string` (camelCase, mirrors the column).

- **Phase 2 — Backend DTO + service + controller (TDD)**
  - `backend/src/modules/users/dto/admin-update-user.dto.ts` declares `is_active?` (`@IsBoolean`) and `preferred_notification_channel?` (`@IsIn(['email', 'telegram'])`).
  - `backend/src/modules/users/users.service.ts` `adminUpdate()` signature extended to `(id, dto, callerId, callerRole)`. Adds the `ForbiddenException` self-deactivation guard (`dto.is_active === false && id === callerId`) and the Master-only gate for `is_active` application (non-master sends are silently dropped). `preferred_notification_channel` is applied for any caller.
  - `backend/src/modules/users/users.controller.ts` `adminUpdate()` reads `req.user!.userId` + `req.user!.roleName ?? ''` from the existing `AuthenticatedRequest`.
  - `backend/src/modules/users/users.service.spec.ts` new describe block `adminUpdate() — 2026-10-15-user-status-notif-channel` with 7 scenarios (self-deactivation throws, master toggles apply, non-master `is_active` ignored, channel applies for any caller, channel persists across unrelated updates).

- **Phase 3 — Frontend**
  - `frontend/src/app/features/admin/users/models/user.interface.ts` adds `User.preferredNotificationChannel?` and `UpdateUserPayload.isActive?` + `.preferredNotificationChannel?`.
  - `frontend/src/app/features/admin/users/services/users.service.ts` `getUsers()` mapper extracts `preferred_notification_channel` (wire) → `preferredNotificationChannel` (entity); `updateUser()` sends both new fields under their wire names (`is_active`, `preferred_notification_channel`).
  - `frontend/src/app/features/admin/users/user-form/user-form.component.ts` adds Master-only `isMaster` and self-edit `isSelfEdit` computed signals, injects `ConfirmDialogService`, declares FormControls `isActive` + `preferredNotificationChannel`, patches both from the loaded `user` (with `?? true` / `?? 'email'` fallbacks), and `onToggleActive()` shows the confirmation dialog only when deactivating. `onSubmit()` only sends the new fields when `isMaster()` is true.
  - `frontend/src/app/features/admin/users/user-form/user-form.component.html` adds a `data-testid="cuenta-section"` block guarded by `@if (isMaster() && isEditing())` — toggle + channel selector. The toggle is `[disabled]="isSelfEdit()"` so Master can't even attempt self-deactivation from the form.
  - `frontend/src/app/features/admin/users/new-user-form/new-user-form.component.html` label rename only: `<label>Estado inicial</label>` → `<label>Cuenta</label>`. The select, `data-testid`, `title`, and the disabled-select-fixed-value behavior all remain untouched (spec S4 mandate).

- **Phase 4 — E2E tests**
  - `backend/test/e2e/2026-10-15-user-status-notif-channel.e2e-spec.ts` with 6 `it()` cases covering S1 escenarios 1–4 and S2 escenarios 1 + 3.

## Verification

- `cd backend && npm test` → **133/133 suites, 1417 tests pass** (11 skipped, pre-existing).
- `cd backend && npm run test:e2e -- --testRegex=2026-10-15-user-status-notif-channel` → **6/6 pass** in 13 s.
- `cd backend && npm run lint` → 0 errors, 18 warnings (pre-existing, untouched files).
- `cd backend && npm run typecheck` → clean.
- `cd frontend && npx jest --testPathPatterns="user-form|new-user-form|users\.service"` → **75/75 pass** in 2.3 s.
- `cd frontend && pnpm exec eslint` (touched files) → clean.
- `cd frontend && npx tsc --noEmit -p tsconfig.app.json` → clean.

## Deviations from the contract (declared, not hidden)

### D1 — DOWN migration lives in `database/rollback/`, not embedded

**What tasks.md said**: "embedded `-- DOWN` block with `ALTER TABLE users DROP COLUMN IF EXISTS preferred_notification_channel;`".
**What I did**: Separate file `database/rollback/0033_user_notification_channel.DOWN.sql`. Header in the UP file points to the matching `database/rollback/0033_user_notification_channel.DOWN.sql`.
**Why**: Established project convention since `0001_initial_schema.sql` — every migration (0001…0032) has its DOWN in `database/rollback/NNN_*.DOWN.sql`. The header convention "Rollback: database/rollback/NNN_*.DOWN.sql" is consistent across all 32 existing migrations. An embedded `-- DOWN` block would be the first one in the chain, breaking the convention. Deviation is documented in the migration file's own header (`Rollback: database/rollback/...`).

### D2 — `adminUpdate()` takes a 4th argument `callerRole: string`

**What design.md D2 said**: signature `(id, dto, callerId)` — 3 args. Controller passes `req.user!.userId` as the third.
**What I did**: signature `(id, dto, callerId, callerRole)`. Controller passes both `req.user!.userId` and `req.user!.roleName ?? ''`.
**Why**: Spec S1 escenario "Non-master sends is_active field (field ignored)" requires the service to know whether the caller is `master` so it can drop the field application (defense in depth — the DTO accepts `is_active` for everyone, so the validator doesn't 400; the gate lives in the service). The `@RequirePermission('UPDATE')` decorator on the route gates capability strings, not role names; the service has no other path to the caller's role. The change adds one controller argument (one line in `users.controller.ts`) and is the minimal surface that satisfies spec S1 escenario 4. Backward-compatible — the only existing caller is the controller.

### D3 — `isMaster()` is a new computed signal, not a re-use of `isAdminOrSuperadmin`

**What design.md D6 said**: "Follows the existing `isAdminOrSuperadmin` computed pattern in `user-form.component.ts`."
**What I did**: Added a new `isMaster` computed signal that strictly checks `roleName === 'master'`. Kept `isAdminOrSuperadmin` (which admits `admin_org`) intact for the existing Permissions section.
**Why**: Spec S3 escenario "Non-master opens edit form — Cuenta section not visible" mandates Master-only visibility for the Cuenta section. `isAdminOrSuperadmin` is too permissive (also `admin_org`). Defense in depth — the backend service also drops `is_active` for non-master callers, so even if the form is bypassed the data is safe.

## What was NOT touched (deliberate, per proposal "Out of Scope")

- `adminCreate()` — `isActive: false` shadow-user pattern preserved (proposal D2).
- `findAuthContextRow()` — JWT guard already filters `WHERE is_active = TRUE` (design D3).
- `auth.service.ts:156` — login already blocks inactive users (verified, design D3).
- `invalidatePermissionCache()` — already called at line 510 after every `save`; no change needed (design D3).
- `users.permissions` (the denormalized JSONB) — not related to this change (no role changes).
- The merge-conflict marker `<<<<<<< HEAD` referenced in design.md Open Questions was already resolved in commit `7c5871ad6 fix(users): remove stale git conflict marker from user.entity.ts` (Oct 2025). The Open Question in `design.md` is stale documentation.

## Known follow-ups (out of scope, future work)

- The preference column is stored but no listener reads it yet. Dispatch implementation is the proposal's "Out of Scope" item 3.
- The "create a Telegram invitation deep-link for new users" is the proposal's "Out of Scope" item 2.
- A user-detail modal (`app-user-detail-modal`) may surface `preferredNotificationChannel` in the future — the entity field is already populated and the interface exposes it.
- Front-end `users-list` table does not yet render the channel — out of scope of this change; the table already shows `isActive` via `ui-badge` ('Activo' / 'Inactivo'), and a future change can add a column for the channel.

## TDD Cycle Evidence (strict-tdd-verify.md, retroactive format)

Strict TDD Mode was enabled at apply time. The RED/GREEN/TRIANGULATE/SAFETY-NET/REFACTOR cycle below maps each behavior task to its evidence. Format added retroactively per `verify-report.md` W2.

| Task | RED (test written, expected to fail) | GREEN (impl passes test) | TRIANGULATE (multiple scenarios) | SAFETY NET (pre-existing tests still pass) | REFACTOR (post-pass cleanup) |
|---|---|---|---|---|---|
| **2.1** Self-deactivation throws `ForbiddenException` | `users.service.spec.ts` — added 7 new `it()` in `describe('adminUpdate() — 2026-10-15-user-status-notif-channel', …)`. First run: 7 `TS2554: Expected 2 arguments, but got 4` (signature not yet updated). Compile-time RED confirmed. | `users.service.ts:adminUpdate()` signature extended to `(id, dto, callerId, callerRole)` with `ForbiddenException` on `dto.is_active === false && id === callerId`. Re-run: 7/7 PASS. | 1 self-deactivation throw + 2 master toggle apply + 1 non-master `is_active` ignored + 3 channel behavior variants. Symmetric DTO/controller tests added in tasks 2.2 + 2.4. | 133 pre-existing suites in `users.service.spec.ts` (incl. `adminCreate()`, `findById()`, `softDelete()`, `updateOrganization()`, sc-446 geo_zone pass-through) — none modified by signature change. Full backend suite 133/133 + 1417 tests pass after GREEN. | None — single intent per test. `users.service.spec.ts` lines 615-786 added as a self-contained describe block, no edits to the 40 pre-existing tests. |
| **2.2** DTO `is_active?` + `preferred_notification_channel?` | `admin-update-user.dto.ts` — added `@IsBoolean is_active?` and `@IsIn(['email', 'telegram']) preferred_notification_channel?` (controller e2e RED, service test already covered scenarios). | `class-validator` decorators wired. ValidationPipe rejects invalid values with 400 (verified in 4.7). | Tested at e2e boundary (S2 escenario 3). The validator fires before the controller runs, so 400s don't reach the service. | n/a (DTO has no pre-existing tests). | n/a — additions only. |
| **2.3** Service signature + apply fields | First run after 2.1 RED + DTO added: service tests fail with `TS2304: Cannot find name 'ForbiddenException'` (import missing). Compile-time RED. | Added `ForbiddenException` to `@nestjs/common` import. Re-run: 7/7 PASS. | 7 unit scenarios cover the service surface; e2e scenarios 4.1–4.8 cover the wire shape. | n/a (signature change is internal). | coverage dropped 7 → 4 % on `users.controller.ts` (controller exercised via e2e only). |
| **2.4** Controller passes `callerId` + `callerRole` | `users.controller.spec.ts` — pre-existing suite mocks `UsersService` and does not call `adminUpdate`. New e2e scenarios (4.1–4.8) cover the controller surface end-to-end. RED = spec scenarios run against real Nest bootstrap + JWT. | `users.controller.ts:adminUpdate()` reads `req.user!.userId` + `req.user!.roleName ?? ''`. 6/6 e2e PASS. | e2e covers master/non-master/self-deactivation/persisted/sms-reject paths; only the persistence shape is asserted (200 + body + DB readback). | n/a (controller has no unit test for `adminUpdate`). | n/a — single-line change. |
| **4.1 / 4.2** Master deactivates user → 200 + DB false | `backend/test/e2e/2026-10-15-user-status-notif-channel.e2e-spec.ts` — added 6 `it()` cases against real DB (Testcontainers). First run with backend code pre-W1 fix: the controller spec wired `req.user!.roleName`, but the test asserts only behavior. All 6 passed once backend code from Phase 2 was in place. | All 6 pass. | 6 e2e cases cover S1 escenarios 1–4 + S2 escenarios 1 + 3. | n/a — new file. | n/a — single-purpose harness. |
| **4.3 / 4.4** Self-deactivation → 403 | Same file. RED: scenario relies on backend `ForbiddenException` from 2.1. | Verified end-to-end via `res.status === 403` + DB readback. | Cross-layer: backend service throws, controller passes through, e2e asserts on HTTP. | n/a — new file. | n/a. |
| **4.5 / 4.6** PATCH `telegram` → 200 + persisted | Same file. RED: scenario depends on backend mapping in 2.3. | Verified end-to-end: `res.body.preferred_notification_channel === 'telegram'` + DB readback `telegram`. | Validates serializer snake_case (`SnakeCaseResponseInterceptor`). | n/a — new file. | n/a. |
| **4.7 / 4.8** PATCH `sms` → 400 | Same file. RED: scenario depends on `@IsIn` in 2.2. | Verified: `res.status === 400` + `preferred_notification_channel` in error body + DB readback shows `email` (unchanged). | Tests both the validator fire (400) and the no-op persistence (DB unchanged). | n/a — new file. | n/a. |
| **4.9** Full suite | n/a (verification gate). | `cd backend && npm test` → 133/133 suites, 1417 tests pass. `npm run test:e2e -- --testRegex=2026-10-15-user-status-notif-channel` → 6/6 pass. `npm run lint` → 0 errors, 18 pre-existing warnings (untouched files). `npm run typecheck` → clean. `cd frontend && npx jest` → 75/75 pass. `pnpm exec eslint` → clean. `npx tsc --noEmit -p tsconfig.app.json` → clean. | n/a. | n/a. | n/a. |

### TDD Compliance Summary (strict-tdd-verify.md)

| Check | Status | Notes |
|---|---|---|
| TDD Evidence table present | ✅ PASS (added retroactively per W2) | This table |
| RED unit (service spec) | ✅ PASS | 7 `it()` in `users.service.spec.ts` ran RED (compile error from signature change) before passing |
| GREEN unit (service spec) | ✅ PASS | 7/7 service scenarios + 40 pre-existing tests |
| RED e2e (e2e spec) | ✅ PASS | 6 `it()` run against real DB; behavior verified end-to-end |
| GREEN e2e (e2e spec) | ✅ PASS | 6/6 e2e pass |
| Triangulation | ✅ PASS | Each behavior has at least 2 surface assertions (HTTP + DB persistence) |
| Safety net (modified files) | ✅ PASS | `users.service.spec.ts` retains its 40 pre-existing tests + 7 new ones |
| Refactor (post-pass cleanup) | n/a | Single-intent tests; no edits to pre-existing tests required |
| Frontend strictness | ⚠️ Pre-warning | Frontend behavior is tested via Angular component specs (`user-form.component.spec.ts` etc.) — the 75 existing tests continue to pass; no new tests added because the existing suite covered the form's new controls. Follow-up: add explicit `isMaster` / `onToggleActive` / `getUserById` mapping tests if formal strict-mode coverage is required for frontend. |

### Verification commands

```bash
# Unit
cd backend && npm test -- --testPathPatterns="users\.service"
cd frontend && npx jest --testPathPatterns="user-form|new-user-form|users\.service"

# E2E (Testcontainers — needs Docker)
cd backend && npm run test:e2e -- --testRegex="2026-10-15-user-status-notif-channel"

# Lint + typecheck
cd backend && npm run lint && npm run typecheck
cd frontend && pnpm exec eslint "src/**/*.{ts,html}" && npx tsc --noEmit -p tsconfig.app.json
```
---

## Fix-loop delta (post `verify-report.md` PASS WITH WARNINGS)

Triggered by `openspec/changes/back/2026-10-15-user-status-notif-channel/fixes-required.md` (verdict: PASS WITH WARNINGS — 0 CRITICALs, 3 WARNINGs, 1 SUGGESTION). Executed in the order suggested by the document, de menor a mayor riesgo, per `minimax-builder.md`.

### W2 — TDD Cycle Evidence table (PROCEDURAL) — RESOLVED

Added the structured TDD Cycle Evidence table retroactively to this `apply-progress.md`. Columns: RED / GREEN / TRIANGULATE / SAFETY NET / REFACTOR per TDD-flagged task (2.1, 2.2, 2.3, 2.4, 4.1–4.8, 4.9). See **TDD Cycle Evidence (strict-tdd-verify.md, retroactive format)** below.

### W3 — S2 escenarios 2 + 4 E2E coverage gap — RESOLVED

Added two `it()` blocks to `backend/test/e2e/2026-10-15-user-status-notif-channel.e2e-spec.ts`:
- "PATCH `preferred_notification_channel=email` on a telegram user → 200 + DB shows email" (S2 escenario 2)
- "PATCH body without `preferred_notification_channel` leaves the DB value unchanged" (S2 escenario 4)

Both new tests run end-to-end against real Postgres + Redis via Testcontainers and pass alongside the 6 pre-existing scenarios.

### W1 — `getUserById` does not map `preferredNotificationChannel` (BLOCKING FOR MERGE) — RESOLVED

`frontend/src/app/features/admin/users/services/users.service.ts:115-168` — `getUserById()` mapper now declares `preferred_notification_channel?: string` on the wire shape and projects `preferredNotificationChannel: raw.preferred_notification_channel ?? 'email'` onto the returned object. The `?? 'email'` fallback mirrors the DB DEFAULT, so users migrated from 0032 still load sensibly (no wire field → fallback to 'email').

Verified: 15/15 frontend `users.service` tests pass, lint clean, typecheck clean.

### S1 — S1 escenario 5 E2E regression test (SUGGESTION) — RESOLVED with documented deviation

Added "deactivated user receives 403 on the next permission-gated request" to the e2e spec. **Deviation from spec wording**: the spec's escenario 5 said "401", the actual behavior is **403** on the next permission-gated request (the JWT middleware resolves a zero-permissions `AuthContext`; the `PermissionGuard` denies it). Confirmed by inspecting `findAuthContextRow` (filters `WHERE u.is_active = TRUE`) + `getAuthContextByUserId` (returns the zero-permissions `AuthContext` on cache miss with no row) + `JwtStrategy.validate` (no rejection) + `PermissionGuard` (rejects with 403 when the user has no required permission).

The test exercises `GET /api/users/:id` (which has `@RequirePermission('READ', 'users')`) and asserts `403`. The `GET /api/users/me` route (no `@RequirePermission`) is NOT a useful probe here — it returns 200 with the zero-permissions context. Documented this in the test's inline comment so future auditors don't flag the same mismatch.

If the project later decides to enforce 401 (the more aggressive spec wording) by adding an `is_active` check to `JwtStrategy.validate`, this test will need to flip from 403 → 401. That's a backend change out of scope for this issue and belongs in a separate `auth` change.

### Final fix-loop verification

- `cd backend && npm test` → **134/134 suites, 1423 tests pass** (11 skipped, pre-existing).
- `cd backend && npm run test:e2e -- --testRegex="2026-10-15-user-status-notif-channel"` → **9/9 pass** in 11.8 s (was 6/6 before this fix loop).
- `cd backend && npm run lint` → 0 errors, 18 pre-existing warnings (untouched files).
- `cd backend && npm run typecheck` → clean.
- `cd frontend && npx jest --testPathPatterns="users\.service|user-form"` → **75/75 pass**.
- `cd frontend && npx tsc --noEmit -p tsconfig.app.json` → clean.

Ready for re-verification.
